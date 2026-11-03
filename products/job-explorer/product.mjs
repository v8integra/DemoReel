import path from 'node:path';

const repo = 'C:/Users/Raven/Desktop/Projects/JobSearcher';

/** How DemoReel starts Job Explorer: the unpackaged build, so JOBSEARCHER_USER_DATA is honoured. */
export default {
  name: 'Job Explorer',
  launch: {
    electron: path.join(repo, 'node_modules/electron/dist/electron.exe'),
    appDir: path.join(repo, 'apps/desktop'),
    // Build first with `npm run build` in apps/desktop.
    // STORE_EDITION=1: film what Microsoft Store customers get (no Adzuna/Remotive, Ollama installed by the user).
    env: (userData) => ({ JOBSEARCHER_USER_DATA: userData, JOBSEARCHER_QUIET_LOG: '1', JOBSEARCHER_STORE_EDITION: '1' }),
  },
};
