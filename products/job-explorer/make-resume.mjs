// Writes assets/Jordan Avery Resume.docx: the made-up resume the tutorial imports.
// Uses the docx package from the Job Explorer repo (node products/job-explorer/make-resume.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire('C:/Users/Raven/Desktop/Projects/JobSearcher/packages/core/package.json');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, TabStopType } = require('docx');

const right = [{ type: TabStopType.RIGHT, position: 9360 }];
const h = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 }, children: [new TextRun({ text, bold: true })] });
const p = (text, opts = {}) => new Paragraph({ spacing: { after: 60 }, ...opts, children: [new TextRun(text)] });
const role = (title, employer, dates) => new Paragraph({ tabStops: right, spacing: { before: 120 }, children: [new TextRun({ text: `${title}, ${employer}`, bold: true }), new TextRun(`\t${dates}`)] });
const bullet = (text) => new Paragraph({ bullet: { level: 0 }, children: [new TextRun(text)] });

const doc = new Document({
  sections: [{
    children: [
      new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: 'Jordan Avery', bold: true })] }),
      p('Denver, CO · jordan.avery@example.com · (555) 014-2290'),
      h('Summary'),
      p('Full-stack engineer with 7 years of experience building React and TypeScript products, from design systems to Node.js APIs. I like small teams, clear ownership, and shipping things customers notice.'),
      h('Experience'),
      role('Senior Software Engineer', 'Cobalt Ridge Software', 'Mar 2022 – Present'),
      p('Denver, CO'),
      bullet('Rebuilt the customer dashboard in React and TypeScript, cutting load time by 60%'),
      bullet('Designed the Node.js reporting API and its PostgreSQL schema'),
      bullet('Mentored four engineers and ran the frontend guild'),
      role('Software Engineer', 'Lanternfish Labs', 'Jun 2018 – Feb 2022'),
      p('Boulder, CO'),
      bullet('Built the booking flow in React, used by 1,200 clinics'),
      bullet('Added end-to-end tests with Playwright, cutting regressions by half'),
      h('Education'),
      role('B.S. Computer Science', 'Colorado State University', '2014 – 2018'),
      h('Skills'),
      p('TypeScript, React, Node.js, PostgreSQL, GraphQL, Playwright, AWS, Design systems'),
    ],
  }],
});

const out = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), 'assets', 'Jordan Avery Resume.docx');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, await Packer.toBuffer(doc));
console.log(out);
