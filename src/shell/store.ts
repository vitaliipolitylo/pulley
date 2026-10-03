// The single write path for durable state (AD-3). No `vscode` import: the
// `globalState` slice is injected so the pipeline is testable.
import { shortReason } from '../core/connection.ts';
import { copy } from '../core/copy.ts';
import { migrate } from '../core/migrate.ts';
import type { Effect, Stored, TransitionResult } from '../core/types.ts';

export const STATE_KEY = 'pulley.state.v1';

/** The slice of `vscode.Memento` (ExtensionContext.globalState) the store uses. */
export interface StateMemento {
	get(key: string): unknown;
	update(key: string, value: unknown): PromiseLike<void>;
}

export type Transition<I, C> = (stored: Stored, input: I, ctx: C) => TransitionResult;

export type StoreRead = { readOnly: true } | { readOnly: false; stored: Stored };

export interface Store {
	/**
	 * Serialized per window: re-read → migrate → transition → await write → run effects → notify.
	 * Read-only mode skips the write and effects. Rejects only this call when the transition
	 * throws or the write fails; later calls still run. A failing effect runner is logged, not rejected.
	 */
	mutate<I, C>(transition: Transition<I, C>, input: I, ctx: C): Promise<void>;
	/** A fresh, migrated read of the stored state (how other windows' writes appear). */
	read(): StoreRead;
	/**
	 * Fires after each completed `mutate`: after the write resolves, and also when the write
	 * was skipped (an unchanged transition, or read-only mode).
	 */
	onDidChange(listener: () => void): { dispose(): void };
}

/**
 * Runs a transition's effects after its write resolved. `stored` is the state just written, so
 * effects are composed from it without a second read (another window's write can't swap an item).
 */
export type EffectRunner = (effects: Effect[], stored: Stored) => Promise<void> | void;

export function createStore(
	memento: StateMemento,
	log: (line: string) => void,
	runEffects?: EffectRunner,
): Store {
	const listeners = new Set<() => void>();
	// Log lines are once per window: newer schema once, each malformed problem once.
	let loggedNewerSchema = false;
	const loggedProblems = new Set<string>();
	let tail: Promise<unknown> = Promise.resolve();

	const readMigrated = () => {
		const result = migrate(memento.get(STATE_KEY));
		if (result.readOnly) {
			if (!loggedNewerSchema) {
				loggedNewerSchema = true;
				log(copy.log.stateNewerSchema(result.schemaVersion));
			}
		} else if (result.malformed && !loggedProblems.has(result.malformed)) {
			loggedProblems.add(result.malformed);
			log(copy.log.stateMalformed(result.malformed));
		}
		return result;
	};

	const notify = (): void => {
		for (const listener of [...listeners]) {
			try {
				listener();
			} catch (error) {
				log(copy.log.listenerFailed(shortReason(error)));
			}
		}
	};

	return {
		mutate<I, C>(transition: Transition<I, C>, input: I, ctx: C): Promise<void> {
			const run = async (): Promise<void> => {
				const read = readMigrated();
				if (read.readOnly) {
					notify();
					return;
				}
				const result = transition(read.stored, input, ctx);
				// An unchanged result needs no write, unless the read was malformed (overwrite it with v1).
				if (result.stored !== read.stored || read.malformed) {
					await memento.update(STATE_KEY, result.stored);
				}
				if (runEffects && result.effects.length > 0) {
					// The write already succeeded, so an effect failure never rejects this call.
					try {
						await runEffects(result.effects, result.stored);
					} catch (error) {
						log(copy.log.effectsFailed(shortReason(error)));
					}
				}
				notify();
			};
			const call = tail.then(run);
			tail = call.catch(() => undefined);
			return call;
		},

		read(): StoreRead {
			const result = readMigrated();
			return result.readOnly ? { readOnly: true } : { readOnly: false, stored: result.stored };
		},

		onDidChange(listener: () => void) {
			listeners.add(listener);
			return { dispose: () => void listeners.delete(listener) };
		},
	};
}
