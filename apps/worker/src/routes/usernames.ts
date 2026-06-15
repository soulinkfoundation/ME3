import type { AppHono } from "../http/types";
import { getMe3CloudUsernameAvailability } from "../sites";

export function registerUsernameRoutes(app: AppHono) {
  app.get("/api/usernames/:username/available", async (c) => {
    const availability = await getMe3CloudUsernameAvailability(
      c.env,
      c.req.param("username"),
    );

    if (!availability) {
      return c.json({ error: "Username availability check failed" }, 502);
    }

    return c.json(availability);
  });
}
