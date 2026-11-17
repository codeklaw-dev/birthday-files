import "server-only";

/**
 * Where invite data lives. Deliberately outside public/ so nothing is
 * reachable without going through an access-checked route.
 * Plain string paths keep the bundler from tracing the whole project.
 */
export const inviteDir = () => process.env.INVITE_DATA_DIR || ".data/invite";
export const dbFile = () => `${inviteDir()}/invite.json`;
export const mediaDir = () => `${inviteDir()}/media`;
export const mediaFile = (id: string, ext: string) => `${mediaDir()}/${id}.${ext}`;
