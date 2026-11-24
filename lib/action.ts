// Turns errors thrown inside a server action into a message the user actually sees.
// Why: in production Next.js replaces thrown action errors with a generic text, so
// "give a reason to publish" or "wrong password" would be lost. Instead the message goes
// into a one-time cookie and <Flash /> in the layout shows it on the next render.
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";

export const FLASH = "nexus_flash";

/** Plain-language message for any error. Never shows SQL or driver internals. */
export function userMessage(err: unknown): string {
  const e = err as { name?: string; message?: string; code?: string; cause?: { code?: string } };
  const code = e?.code ?? e?.cause?.code;
  // 23505 = unique violation: the database stopped a double save / double publish / duplicate leave.
  if (code === "23505") return "Someone else changed this at the same moment (or it was submitted twice). Reload the page and check before trying again.";
  if (e?.name === "DrizzleQueryError" || e?.name === "NeonDbError" || code) {
    console.error(err);
    return "The database could not save this. Please try again.";
  }
  return e?.message || "Something went wrong.";
}

/** Run an action body; redirects pass through, errors become a flash message. */
export async function guard(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    unstable_rethrow(err); // redirect() / notFound() are not errors
    (await cookies()).set(FLASH, `${Date.now()}|${userMessage(err)}`, { path: "/", maxAge: 60, sameSite: "lax" });
  }
}
