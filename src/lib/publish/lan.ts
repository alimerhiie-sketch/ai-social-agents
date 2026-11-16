import os from "node:os";

/** The phone page's address on your home Wi-Fi, e.g. http://192.168.1.12:3210/post */
export function lanUrl(path = "/post") {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family === "IPv4" && !i.internal && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address)) return `http://${i.address}:3210${path}`;
    }
  }
  return null;
}
