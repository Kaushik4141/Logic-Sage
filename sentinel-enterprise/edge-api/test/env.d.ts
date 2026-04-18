declare module "cloudflare:test" {
	export const env: Env;
	export const SELF: {
		fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
	};

	export function createExecutionContext(): ExecutionContext;
	export function waitOnExecutionContext(ctx: ExecutionContext): Promise<void>;

	interface ExecutionContext {
		waitUntil(promise: Promise<unknown>): void;
		passThroughOnException(): void;
	}
}

declare module "cloudflare:test" {
	interface ProvidedEnv extends Env {}
}
