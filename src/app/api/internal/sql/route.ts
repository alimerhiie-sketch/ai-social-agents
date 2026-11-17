import { bearerOk } from "@/lib/auth";
import { sqlOnD1 } from "@/lib/db";

export const dynamic = "force-dynamic";

/** The GitHub Actions runner's database access (bearer HQ_SECRET). Same queries the dashboard runs. */
export async function POST(req: Request) {
  if (!(await bearerOk(req))) return new Response("Unauthorized", { status: 401 });
  const { mode, query, args } = (await req.json()) as { mode: "all" | "get" | "run"; query: string; args: (string | number | null)[] };
  try {
    const result = mode === "all" ? await sqlOnD1.all(query, ...args) : mode === "get" ? await sqlOnD1.get(query, ...args) : await sqlOnD1.run(query, ...args);
    return Response.json({ result });
  } catch (e) {
    return new Response(String((e as Error).message), { status: 400 });
  }
}
