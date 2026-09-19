import {
  AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow,
  TextRun, WidthType,
} from "docx";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { groupSkills } from "./content";
import type { ResumeDoc } from "./build";

export type Layout = "single" | "two-column" | "table" | "docx" | "docx-table";

const A4: [number, number] = [595.28, 841.89];
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.42, 0.44, 0.48);

/** Helvetica is WinAnsi-only; accented names go through the DOCX path instead. */
const toWinAnsi = (s: string) =>
  s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-")
    // U+2022 is outside Latin-1, so the catch-all below would turn every bullet
    // into a question mark. Middle dot is the closest character that survives.
    .replace(/[•]/g, "·")
    .replace(/[^\x20-\xFF]/g, "?");

interface Ctx {
  pdf: PDFDocument;
  page: PDFPage;
  regular: PDFFont;
  bold: PDFFont;
  y: number;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = toWinAnsi(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function write(
  ctx: Ctx,
  text: string,
  opts: { x: number; width: number; size?: number; bold?: boolean; gap?: number; color?: typeof INK },
): void {
  const size = opts.size ?? 9.5;
  const font = opts.bold ? ctx.bold : ctx.regular;
  for (const line of wrap(text, font, size, opts.width)) {
    if (ctx.y < 56) {
      ctx.page = ctx.pdf.addPage(A4);
      ctx.y = A4[1] - 56;
    }
    ctx.page.drawText(line, { x: opts.x, y: ctx.y, size, font, color: opts.color ?? INK });
    ctx.y -= size * 1.32;
  }
  ctx.y -= opts.gap ?? 0;
}

function heading(ctx: Ctx, label: string, x: number, width: number): void {
  ctx.y -= 6;
  write(ctx, label.toUpperCase(), { x, width, size: 8.5, bold: true, gap: 2, color: MUTED });
}

export async function renderPdf(doc: ResumeDoc, layout: Layout, rawText?: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const ctx: Ctx = {
    pdf,
    page: pdf.addPage(A4),
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    y: A4[1] - 60,
  };

  if (rawText) {
    for (const line of rawText.split("\n")) write(ctx, line, { x: 48, width: 500, size: 11 });
    return pdf.save();
  }

  if (layout === "two-column") renderTwoColumn(ctx, doc);
  else if (layout === "table") renderTable(ctx, doc);
  else renderSingle(ctx, doc);

  return pdf.save();
}

function header(ctx: Ctx, doc: ResumeDoc, x: number, width: number): void {
  write(ctx, doc.name, { x, width, size: 19, bold: true, gap: 1 });
  write(ctx, doc.headline, { x, width, size: 11, gap: 1, color: MUTED });
  write(ctx, `${doc.email}  |  ${doc.phone}  |  ${doc.city}`, { x, width, size: 8.5, color: MUTED });
  write(ctx, doc.links.join("  |  "), { x, width, size: 8.5, gap: 4, color: MUTED });
}

/** "Languages: Go | TypeScript" — the grouped form a technical resume uses. */
function skillsBlock(ctx: Ctx, doc: ResumeDoc, x: number, width: number): void {
  for (const g of groupSkills(doc.skills)) {
    write(ctx, `${g.label}: ${g.items.join(" | ")}`, { x, width });
  }
  ctx.y -= 4;
}

function projectsBlock(ctx: Ctx, doc: ResumeDoc, x: number, width: number): void {
  if (doc.projects.length === 0) return;
  heading(ctx, "Projects", x, width);
  for (const pr of doc.projects) {
    write(ctx, `${pr.name} — ${pr.url}`, { x, width, size: 9.5, bold: true });
    write(ctx, pr.blurb, { x, width, gap: 3 });
  }
}

function certificationsBlock(ctx: Ctx, doc: ResumeDoc, x: number, width: number): void {
  if (doc.certifications.length === 0) return;
  heading(ctx, "Certifications", x, width);
  for (const c of doc.certifications) write(ctx, `• ${c}`, { x, width });
  ctx.y -= 4;
}

function educationLine(doc: ResumeDoc): string {
  const { degree, school, location, year, honours } = doc.education;
  return [`${degree}, ${school}, ${location}`, String(year), honours].filter(Boolean).join(" — ");
}

function jobBlock(ctx: Ctx, doc: ResumeDoc, x: number, width: number): void {
  for (const job of doc.jobs) {
    // "Company, Location | Title | MM/YYYY - MM/YYYY" is the conventional entry header.
    write(ctx, `${job.company}, ${job.location}`, { x, width, size: 10, bold: true });
    write(ctx, `${job.title}  |  ${job.employment}  |  ${job.from} - ${job.to}`, {
      x, width, size: 8.5, gap: 2, color: MUTED,
    });
    for (const b of job.bullets) write(ctx, `• ${b}`, { x: x + 8, width: width - 8 });
    if (job.stack.length) {
      write(ctx, `Stack: ${job.stack.join(", ")}`, { x: x + 8, width: width - 8, size: 8.5, color: MUTED });
    }
    ctx.y -= 6;
  }
}

function renderSingle(ctx: Ctx, doc: ResumeDoc): void {
  const x = 48;
  const width = A4[0] - 96;
  header(ctx, doc, x, width);
  heading(ctx, "Summary", x, width);
  write(ctx, doc.summary, { x, width, gap: 4 });
  heading(ctx, "Skills", x, width);
  skillsBlock(ctx, doc, x, width);
  heading(ctx, "Experience", x, width);
  jobBlock(ctx, doc, x, width);
  projectsBlock(ctx, doc, x, width);
  certificationsBlock(ctx, doc, x, width);
  heading(ctx, "Education", x, width);
  write(ctx, educationLine(doc), { x, width });
}

/** Sidebar plus main column — PDF extraction interleaves these, which is the point. */
function renderTwoColumn(ctx: Ctx, doc: ResumeDoc): void {
  const leftX = 44;
  const leftW = 150;
  const rightX = 216;
  const rightW = A4[0] - rightX - 44;

  header(ctx, doc, leftX, A4[0] - 88);
  const top = ctx.y;

  heading(ctx, "Contact", leftX, leftW);
  write(ctx, doc.email, { x: leftX, width: leftW, size: 8.5 });
  write(ctx, doc.phone, { x: leftX, width: leftW, size: 8.5 });
  write(ctx, doc.city, { x: leftX, width: leftW, size: 8.5, gap: 4 });
  heading(ctx, "Skills", leftX, leftW);
  for (const s of doc.skills) write(ctx, `• ${s}`, { x: leftX, width: leftW, size: 8.5 });
  heading(ctx, "Education", leftX, leftW);
  write(ctx, `${doc.education.degree}`, { x: leftX, width: leftW, size: 8.5 });
  write(ctx, `${doc.education.school} (${doc.education.year})`, { x: leftX, width: leftW, size: 8.5 });
  if (doc.education.honours) write(ctx, doc.education.honours, { x: leftX, width: leftW, size: 8.5 });
  if (doc.certifications.length) {
    heading(ctx, "Certifications", leftX, leftW);
    for (const c of doc.certifications) write(ctx, c, { x: leftX, width: leftW, size: 8 });
  }

  ctx.y = top;
  heading(ctx, "Summary", rightX, rightW);
  write(ctx, doc.summary, { x: rightX, width: rightW, gap: 4 });
  heading(ctx, "Experience", rightX, rightW);
  jobBlock(ctx, doc, rightX, rightW);
  projectsBlock(ctx, doc, rightX, rightW);
}

/** Experience laid out as a grid with ruled rows. */
function renderTable(ctx: Ctx, doc: ResumeDoc): void {
  const x = 46;
  const width = A4[0] - 92;
  header(ctx, doc, x, width);
  heading(ctx, "Summary", x, width);
  write(ctx, doc.summary, { x, width, gap: 4 });
  heading(ctx, "Skills", x, width);
  skillsBlock(ctx, doc, x, width);
  heading(ctx, "Experience", x, width);

  const dateW = 78;
  const bodyX = x + dateW + 12;
  const bodyW = width - dateW - 12;
  for (const job of doc.jobs) {
    const rowTop = ctx.y + 10;
    write(ctx, `${job.from} - ${job.to}`, { x, width: dateW, size: 8.5, color: MUTED });
    const afterDate = ctx.y;
    ctx.y = rowTop - 10;
    write(ctx, `${job.title}, ${job.company}, ${job.location}`, { x: bodyX, width: bodyW, size: 10, bold: true });
    for (const b of job.bullets) write(ctx, b, { x: bodyX, width: bodyW });
    if (job.stack.length) {
      write(ctx, `Stack: ${job.stack.join(", ")}`, { x: bodyX, width: bodyW, size: 8.5, color: MUTED });
    }
    ctx.y = Math.min(ctx.y, afterDate) - 4;
    ctx.page.drawLine({
      start: { x, y: ctx.y + 6 },
      end: { x: x + width, y: ctx.y + 6 },
      thickness: 0.5,
      color: rgb(0.85, 0.86, 0.88),
    });
    ctx.y -= 8;
  }
  projectsBlock(ctx, doc, x, width);
  certificationsBlock(ctx, doc, x, width);
  heading(ctx, "Education", x, width);
  write(ctx, educationLine(doc), { x, width });
}

export async function renderDocx(doc: ResumeDoc, layout: Layout): Promise<Buffer> {
  const heading2 = (t: string) =>
    new Paragraph({ text: t.toUpperCase(), heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 80 } });

  const experience =
    layout === "docx-table"
      ? [
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: doc.jobs.map(
              (job) =>
                new TableRow({
                  children: [
                    new TableCell({
                      width: { size: 22, type: WidthType.PERCENTAGE },
                      children: [new Paragraph(`${job.from} - ${job.to}`)],
                    }),
                    new TableCell({
                      width: { size: 78, type: WidthType.PERCENTAGE },
                      children: [
                        new Paragraph({ children: [new TextRun({ text: `${job.title}, ${job.company}, ${job.location}`, bold: true })] }),
                        ...job.bullets.map((b) => new Paragraph({ text: b, bullet: { level: 0 } })),
                        ...(job.stack.length ? [new Paragraph({ children: [new TextRun({ text: `Stack: ${job.stack.join(", ")}`, italics: true, size: 17 })] })] : []),
                      ],
                    }),
                  ],
                }),
            ),
          }),
        ]
      : doc.jobs.flatMap((job) => [
          new Paragraph({ children: [new TextRun({ text: `${job.company}, ${job.location}`, bold: true })] }),
          new Paragraph({
            children: [
              new TextRun({ text: `${job.title} | ${job.employment} | ${job.from} - ${job.to}`, italics: true }),
            ],
          }),
          ...job.bullets.map((b) => new Paragraph({ text: b, bullet: { level: 0 } })),
          ...(job.stack.length
            ? [new Paragraph({ children: [new TextRun({ text: `Stack: ${job.stack.join(", ")}`, italics: true, size: 17 })] })]
            : []),
        ]);

  const document = new Document({
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun({ text: doc.name, bold: true, size: 38 })] }),
          new Paragraph({ text: doc.headline }),
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [new TextRun({ text: `${doc.email} | ${doc.phone} | ${doc.city}`, size: 18 })],
          }),
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [new TextRun({ text: doc.links.join(" | "), size: 18 })],
          }),
          heading2("Summary"),
          new Paragraph(doc.summary),
          heading2("Skills"),
          ...groupSkills(doc.skills).map(
            (g) =>
              new Paragraph({
                children: [
                  new TextRun({ text: `${g.label}: `, bold: true }),
                  new TextRun({ text: g.items.join(" | ") }),
                ],
              }),
          ),
          heading2("Experience"),
          ...experience,
          ...(doc.projects.length
            ? [
                heading2("Projects"),
                ...doc.projects.flatMap((pr) => [
                  new Paragraph({ children: [new TextRun({ text: `${pr.name} — ${pr.url}`, bold: true })] }),
                  new Paragraph(pr.blurb),
                ]),
              ]
            : []),
          ...(doc.certifications.length
            ? [heading2("Certifications"), ...doc.certifications.map((c) => new Paragraph({ text: c, bullet: { level: 0 } }))]
            : []),
          heading2("Education"),
          new Paragraph(
            [
              `${doc.education.degree}, ${doc.education.school}, ${doc.education.location}`,
              String(doc.education.year),
              doc.education.honours,
            ]
              .filter(Boolean)
              .join(" — "),
          ),
        ],
      },
    ],
  });

  return Packer.toBuffer(document);
}
