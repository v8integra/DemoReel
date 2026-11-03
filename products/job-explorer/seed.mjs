// Demo data for Job Explorer: a made-up person, made-up companies, scored by the real local AI.
// Everything goes through the app's own window.api, so the data is exactly what a user would have.

const person = {
  fullName: 'Jordan Avery',
  email: 'jordan.avery@example.com',
  phone: '(555) 014-2290',
  address: { line1: '', line2: '', city: 'Denver', region: 'CO', postalCode: '', country: 'United States' },
  links: { linkedin: '', github: '', portfolio: '', other: [] },
};

const blocks = [
  ['summary', { text: 'Full-stack engineer with 7 years of experience building React and TypeScript products, from design systems to Node.js APIs. I like small teams, clear ownership, and shipping things customers notice.' }],
  ['work_experience', {
    title: 'Senior Software Engineer', employer: 'Cobalt Ridge Software', location: 'Denver, CO', startDate: '2022-03', endDate: '', current: true,
    description: 'Lead engineer on the customer dashboard used by 40,000 businesses.',
    highlights: ['Rebuilt the dashboard in React and TypeScript, cutting load time by 60%', 'Designed the Node.js reporting API and its PostgreSQL schema', 'Mentored four engineers and ran the frontend guild'],
  }],
  ['work_experience', {
    title: 'Software Engineer', employer: 'Lanternfish Labs', location: 'Boulder, CO', startDate: '2018-06', endDate: '2022-02', current: false,
    description: 'Product engineer on a scheduling app for clinics.',
    highlights: ['Built the booking flow in React, used by 1,200 clinics', 'Added end-to-end tests with Playwright, cutting regressions by half'],
  }],
  ['education', { institution: 'Colorado State University', degree: 'B.S.', field: 'Computer Science', startDate: '2014', endDate: '2018' }],
  ['skills', { category: 'Engineering', skills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'GraphQL', 'Playwright', 'AWS', 'Design systems'] }],
];

const jobs = [
  {
    title: 'Senior Frontend Engineer', company: 'Brightwater Health', location: 'Denver, CO (Hybrid)',
    description: 'Brightwater Health builds patient scheduling software for 3,000 clinics. We are hiring a Senior Frontend Engineer to own our React and TypeScript web app. You will lead our design system, work closely with product and design, and mentor two engineers. Requirements: 5+ years with React and TypeScript, experience with design systems, testing with Playwright or Cypress. Nice to have: Node.js, GraphQL, healthcare experience. Hybrid in Denver, 2 days a week in the office. Salary $150,000 - $175,000.',
  },
  {
    title: 'Full Stack Engineer, Payments', company: 'Tallgrass Finance', location: 'Remote (US)',
    description: 'Join the Payments team at Tallgrass Finance. You will build features end to end in TypeScript: React on the front end, Node.js services and PostgreSQL on the back end. We value ownership and clear writing. Requirements: 4+ years of professional software engineering, strong TypeScript, React, Node.js, SQL. Experience with AWS is a plus. Fully remote within the US. Salary $140,000 - $165,000.',
  },
  {
    title: 'Staff Software Engineer, Platform', company: 'Northwind Logistics', location: 'Remote (US)',
    description: 'Northwind Logistics is looking for a Staff Engineer to lead our platform group. You will set technical direction for 25 engineers across Go and Kubernetes services, own reliability, and drive our move to event-driven architecture. Requirements: 10+ years of experience, deep Go and Kubernetes expertise, experience running large distributed systems in production. Salary $210,000 - $240,000.',
  },
  {
    title: 'Frontend Developer (Contract)', company: 'Pixel & Pine Agency', location: 'Denver, CO (Onsite)',
    description: 'Six-month contract building marketing websites for agency clients. WordPress, PHP, jQuery, and some React. Onsite in our Denver studio five days a week. Hourly rate $45 - $55.',
  },
  {
    title: 'Senior Software Engineer, Product', company: 'Summit Learning Co.', location: 'Boulder, CO (Hybrid)',
    description: 'Summit Learning builds reading tools for schools. As a Senior Software Engineer on the product team you will build new features in React and TypeScript, design APIs in Node.js, and help shape our engineering culture. Requirements: 5+ years building web applications, React, TypeScript, Node.js, PostgreSQL. Experience mentoring engineers. Hybrid, Boulder office 1 day a week. Salary $145,000 - $170,000.',
  },
];

const applications = [
  { company: 'Cedar Loop', title: 'Senior React Engineer', days: 26, status: 'interviewing', location: 'Remote (US)', arrangement: 'remote', salaryText: '$155k - $170k' },
  { company: 'Harborline Analytics', title: 'Full Stack Engineer', days: 21, status: 'responded', location: 'Denver, CO', arrangement: 'hybrid', salaryText: '' },
  { company: 'Quarry Systems', title: 'Senior Software Engineer', days: 18, status: 'rejected', location: 'Remote (US)', arrangement: 'remote', salaryText: '' },
  { company: 'Meadowlark Apps', title: 'Frontend Engineer', days: 14, status: 'confirmed', location: 'Boulder, CO', arrangement: 'onsite', salaryText: '' },
  { company: 'Kestrel Robotics', title: 'Software Engineer, Web', days: 9, status: 'applied', location: 'Remote (US)', arrangement: 'remote', salaryText: '$140k' },
  { company: 'Juniper Cloud', title: 'Senior TypeScript Engineer', days: 5, status: 'applied', location: 'Remote (US)', arrangement: 'remote', salaryText: '' },
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const dayISO = (daysAgo) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);

export async function seed(page, log = console.log) {
  const now = new Date().toISOString();
  await page.evaluate(async ({ person, blocks, now }) => {
    const api = window.api;
    await api.settings.update({ setup: { completedAt: now, guideShownAt: now } });
    await api.profile.save(person);
    await api.profile.setApproved(true);
    for (const [type, content] of blocks) {
      const b = await api.blocks.create(type, content);
      await api.blocks.setApproved(b.id, true);
    }
  }, { person, blocks, now });
  log('profile and data blocks saved');

  // Local AI (Ollama) scores the jobs, so nothing leaves the computer and no key is needed.
  const switched = await page.evaluate(() => window.api.ai.switchTo('ollama'));
  log('AI provider: ' + JSON.stringify(switched).slice(0, 200));

  const profileId = await page.evaluate(async () => {
    const api = window.api;
    const [denver] = await api.search.places('Denver');
    const p = await api.search.createProfile({
      name: 'Senior web engineer',
      description: 'Senior full-stack or frontend role on a product team, mostly React and TypeScript, with some Node.js. Remote or hybrid near Denver.',
      targetTitles: ['Software Engineer', 'Frontend Engineer', 'Full Stack Engineer'],
      focusSkills: ['React', 'TypeScript', 'Node.js'],
      avoidSkills: ['PHP', 'WordPress'],
      locations: denver ? [{ label: denver.label, lat: denver.lat, lon: denver.lon, country: denver.country, region: denver.region ?? '', radiusMiles: 40 }] : [],
      remoteCountries: ['US'],
      filters: { minSalary: 130000 },
    });
    return p.id;
  });
  log('search profile ' + profileId);

  for (const j of jobs) {
    const t = Date.now();
    const item = await page.evaluate(
      (input) => window.api.search.addManualJob(input),
      { searchProfileId: profileId, url: `https://jobs.example.com/${slug(j.company)}/${slug(j.title)}`, ...j },
    );
    log(`scored ${j.company}: ${JSON.stringify(item).slice(0, 160)} (${((Date.now() - t) / 1000).toFixed(0)} s)`);
  }

  for (const a of applications) {
    await page.evaluate(async ({ a, date, url }) => {
      const api = window.api;
      const r = await api.tracker.logManual({ url, company: a.company, title: a.title, location: a.location, arrangement: a.arrangement, salaryText: a.salaryText, dateApplied: date }, true);
      if (r.ok && a.status !== 'applied') {
        const path = ['confirmed', 'responded', 'interviewing'];
        const steps = a.status === 'rejected' ? ['confirmed', 'rejected'] : path.slice(0, path.indexOf(a.status) + 1);
        for (const s of steps) await api.tracker.setStatus(r.application.id, s);
      }
    }, { a, date: dayISO(a.days), url: `https://jobs.example.com/${slug(a.company)}/${slug(a.title)}` });
  }
  log(`${applications.length} applications logged`);
}
