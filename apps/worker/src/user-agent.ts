import type { Env } from "./types";

export class Me3UserAgent {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.endsWith("/health")) {
      return Response.json({
        ok: true,
        service: "me3-core-user-agent",
        storage: Boolean(this.state.storage),
        ai: Boolean(this.env.AI),
      });
    }

    return Response.json(
      {
        ok: true,
        message: "ME3 Core user agent is ready for the first extraction slice.",
      },
      { status: 202 },
    );
  }
}
