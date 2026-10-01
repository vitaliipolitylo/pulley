// One check with a fresh silent token; an `unauthenticated` result retries the
// silent lookup and check exactly once (AD-11). No `vscode` import.
import { copy } from '../core/copy.ts';
import type { CheckResult } from '../core/types.ts';

export interface CheckWithRetryDeps {
	getToken: () => Promise<{ accountId: string; token: string } | undefined>;
	runCheck: (token: string, accountId: string) => Promise<CheckResult>;
	log: (line: string) => void;
}

/** Returns undefined when no session is available. */
export async function checkWithRetry(deps: CheckWithRetryDeps): Promise<CheckResult | undefined> {
	const attempt = async (): Promise<CheckResult | undefined> => {
		const session = await deps.getToken();
		return session ? deps.runCheck(session.token, session.accountId) : undefined;
	};
	deps.log(copy.log.checkStarted);
	const first = await attempt();
	if (first && !first.ok && first.reason === 'unauthenticated') {
		deps.log(copy.log.checkRetryAfter401);
		return attempt();
	}
	return first;
}
