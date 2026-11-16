import { cliStatus } from "@/lib/claude-cli";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const force = new URL(req.url).searchParams.has("refresh");
  return Response.json(await cliStatus(force));
}
