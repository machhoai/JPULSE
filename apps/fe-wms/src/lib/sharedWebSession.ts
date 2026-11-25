const sharedWebHosts = new Set([
  "jpulse.joyworldcityfuns.vn",
  "jpos.joyworldcityfuns.vn",
]);

let passwordLogins = 0;

export const isSharedWebHost = () =>
  typeof window !== "undefined" && sharedWebHosts.has(window.location.hostname);

export const isWebPasswordLoginInProgress = () => passwordLogins > 0;

export async function trackWebPasswordLogin<T>(login: () => Promise<T>): Promise<T> {
  passwordLogins += 1;
  try {
    return await login();
  } finally {
    passwordLogins -= 1;
  }
}
