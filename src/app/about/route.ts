import { APP_NAME, publicPage } from "@/lib/public-page";

export const dynamic = "force-static";

export function GET() {
  return publicPage(
    "About",
    `<h1>${APP_NAME}</h1>
<p class="meta">A private publishing tool for the AMX AI creator accounts.</p>
<p>${APP_NAME} is the posting tool behind <strong>AMX AI</strong>, an English-language channel that explains AI tools in plain words
(<a href="https://www.instagram.com/amx_ai1/">@amx_ai1</a> on Instagram and TikTok). Short videos and image posts are planned, written and
designed in our own studio, then reviewed by the account owner.</p>
<h2>What it does</h2>
<ul>
  <li>Keeps the account owner's content calendar: scripts, finished videos and slides, and the time each piece should go out.</li>
  <li>Shows the owner a preview of every post together with its caption and posting settings (who can view it, comments, Duet and Stitch,
  AI-generated label) before the owner approves it.</li>
  <li>At the time the owner chose, publishes the approved post to the owner's own connected account and records the result.</li>
</ul>
<h2>Who can use it</h2>
<p>Only the account owner, who signs in with a password. ${APP_NAME} does not offer accounts to the public, does not post to anyone else's
account, and never posts anything the owner has not approved.</p>
<p>Read the <a href="/legal/terms">Terms of Service</a> and the <a href="/legal/privacy">Privacy Policy</a>.</p>`,
  );
}
