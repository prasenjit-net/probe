//! Server-side PDF report generation using printpdf.

use crate::models::{ExecutionReport, OverallStatus, StepResult};
use printpdf::{
    BuiltinFont, Color, IndirectFontRef, Line, Mm, PdfDocument, PdfDocumentReference,
    PdfLayerIndex, PdfLayerReference, PdfPageIndex, Point, Polygon, Rgb,
    path::{PaintMode, WindingOrder},
};

// ── Page geometry ─────────────────────────────────────────────────────────────
const PW: f32 = 210.0;
const PH: f32 = 297.0;
const ML: f32 = 16.0;
const MR: f32 = PW - ML;
const MB: f32 = 22.0;
const CW: f32 = MR - ML;

// ── Colours ───────────────────────────────────────────────────────────────────
const C_HEADER_BG: (f32, f32, f32) = (0.067, 0.078, 0.200);
const C_HEADER_TXT: (f32, f32, f32) = (1.0, 1.0, 1.0);
const C_PASS: (f32, f32, f32) = (0.059, 0.725, 0.506);
const C_FAIL: (f32, f32, f32) = (0.922, 0.259, 0.259);
const C_RULE: (f32, f32, f32) = (0.85, 0.85, 0.85);
const C_LABEL: (f32, f32, f32) = (0.45, 0.45, 0.45);
const C_REQ_BG: (f32, f32, f32) = (0.961, 0.973, 1.0);
const C_RESP_BG: (f32, f32, f32) = (0.961, 1.0, 0.976);
const C_PASS_BG: (f32, f32, f32) = (0.94, 1.0, 0.96);
const C_FAIL_BG: (f32, f32, f32) = (1.0, 0.94, 0.94);
const BLACK: (f32, f32, f32) = (0.0, 0.0, 0.0);

// ── Typography (pt) ───────────────────────────────────────────────────────────
const S_H1: f32 = 16.0;
const S_H2: f32 = 11.0;
const S_H3: f32 = 9.5;
const S_BODY: f32 = 8.5;
const S_SMALL: f32 = 7.5;
const S_MONO: f32 = 7.5;

// ─────────────────────────────────────────────────────────────────────────────

struct Builder {
    doc: PdfDocumentReference,
    font: IndirectFontRef,
    bold: IndirectFontRef,
    page: PdfPageIndex,
    lay: PdfLayerIndex,
    y: f32,
}

impl Builder {
    fn new(title: &str) -> Self {
        let (doc, page, lay) = PdfDocument::new(title, Mm(PW), Mm(PH), "Content");
        let font = doc.add_builtin_font(BuiltinFont::Helvetica).unwrap();
        let bold = doc.add_builtin_font(BuiltinFont::HelveticaBold).unwrap();
        Self {
            doc,
            font,
            bold,
            page,
            lay,
            y: PH,
        }
    }

    fn layer(&self) -> PdfLayerReference {
        self.doc.get_page(self.page).get_layer(self.lay)
    }

    fn new_page(&mut self) {
        let (page, lay) = self.doc.add_page(Mm(PW), Mm(PH), "Content");
        self.page = page;
        self.lay = lay;
        self.y = PH - ML;
    }

    fn ensure(&mut self, needed: f32) {
        if self.y < MB + needed {
            self.new_page();
        }
    }

    fn set_fill(&self, c: (f32, f32, f32)) {
        self.layer()
            .set_fill_color(Color::Rgb(Rgb::new(c.0, c.1, c.2, None)));
    }
    fn set_stroke(&self, c: (f32, f32, f32)) {
        self.layer()
            .set_outline_color(Color::Rgb(Rgb::new(c.0, c.1, c.2, None)));
    }

    fn text(&self, s: &str, x: f32, sz: f32, bold: bool, col: (f32, f32, f32)) {
        self.set_fill(col);
        let f = if bold { &self.bold } else { &self.font };
        self.layer()
            .use_text(Self::sanitise(s), sz, Mm(x), Mm(self.y), f);
        self.set_fill(BLACK);
    }

    fn dn(&mut self, mm: f32) {
        self.y -= mm;
    }

    fn hline(&self, x1: f32, x2: f32, thickness: f32, col: (f32, f32, f32)) {
        self.set_stroke(col);
        self.layer().set_outline_thickness(thickness);
        self.layer().add_line(Line {
            points: vec![
                (Point::new(Mm(x1), Mm(self.y)), false),
                (Point::new(Mm(x2), Mm(self.y)), false),
            ],
            is_closed: false,
        });
    }

    fn rect(&self, x: f32, y_top: f32, w: f32, h: f32, col: (f32, f32, f32)) {
        self.set_fill(col);
        self.layer().add_polygon(Polygon {
            rings: vec![vec![
                (Point::new(Mm(x), Mm(y_top)), false),
                (Point::new(Mm(x + w), Mm(y_top)), false),
                (Point::new(Mm(x + w), Mm(y_top - h)), false),
                (Point::new(Mm(x), Mm(y_top - h)), false),
            ]],
            mode: PaintMode::Fill,
            winding_order: WindingOrder::NonZero,
        });
        self.set_fill(BLACK);
    }

    fn badge(&self, label: &str, x: f32, col: (f32, f32, f32)) -> f32 {
        let w = label.len() as f32 * 1.55 + 5.0;
        self.rect(x, self.y + 2.5, w, 5.0, col);
        self.set_fill(C_HEADER_TXT);
        self.layer()
            .use_text(label, 7.5_f32, Mm(x + 2.5), Mm(self.y), &self.bold);
        self.set_fill(BLACK);
        w + 2.0
    }

    fn method_badge(&self, method: &str, x: f32) -> f32 {
        let col: (f32, f32, f32) = match method {
            "GET" => (0.059, 0.725, 0.506),
            "POST" => (0.227, 0.494, 0.961),
            "PUT" => (0.847, 0.573, 0.0),
            "PATCH" => (0.918, 0.435, 0.012),
            "DELETE" => (0.922, 0.259, 0.259),
            _ => (0.5, 0.5, 0.5),
        };
        let w = method.len() as f32 * 1.8 + 4.0;
        self.rect(x, self.y + 2.5, w, 5.0, col);
        self.set_fill(C_HEADER_TXT);
        self.layer()
            .use_text(method, 7.5_f32, Mm(x + 2.0), Mm(self.y), &self.bold);
        self.set_fill(BLACK);
        w + 2.0
    }

    fn multiline(&mut self, raw: &str, x: f32, sz: f32, col: (f32, f32, f32), max_lines: usize) {
        let char_w_mm = sz * 0.042;
        let chars = ((CW - (x - ML)) / char_w_mm) as usize;
        let chars = chars.clamp(30, 200);
        let advance = sz * 0.40;
        let mut count = 0;
        'outer: for line in raw.split('\n') {
            if line.is_empty() {
                self.dn(advance * 0.5);
                count += 1;
                if count >= max_lines {
                    break;
                }
                continue;
            }
            let mut start = 0;
            while start < line.len() {
                if count >= max_lines {
                    self.ensure(advance + 1.0);
                    self.text("...", x, sz, false, C_LABEL);
                    self.dn(advance);
                    break 'outer;
                }
                let end = byte_boundary(line, start + chars);
                let chunk = &line[start..end];
                self.ensure(advance + 1.0);
                self.text(chunk, x, sz, false, col);
                self.dn(advance);
                count += 1;
                start = end;
            }
        }
    }

    /// Wrap and render markdown text as plain text (strips markdown syntax).
    fn markdown_multiline(&mut self, raw: &str, x: f32, sz: f32, max_lines: usize) {
        // Strip common markdown: ##/# headings, **, *, `, -, >
        let cleaned = raw
            .lines()
            .map(|line| {
                let l = line.trim_start_matches('#').trim();
                let l = l.replace(['*', '`'], "").replace("> ", "");
                // bullet points -> dash
                if l.starts_with("- ") || l.starts_with("• ") {
                    format!("  • {}", &l[2..])
                } else {
                    l
                }
            })
            .collect::<Vec<_>>()
            .join("\n");

        // Render each line, using bold for lines that were headings
        let char_w_mm = sz * 0.042;
        let chars = ((CW - (x - ML)) / char_w_mm) as usize;
        let chars = chars.clamp(30, 200);
        let advance = sz * 0.40;
        let mut count = 0;

        'outer: for (orig_line, clean_line) in raw.lines().zip(cleaned.lines()) {
            if count >= max_lines {
                self.ensure(advance + 1.0);
                self.text("...", x, sz, false, C_LABEL);
                self.dn(advance);
                break;
            }
            let is_heading = orig_line.trim_start().starts_with('#');
            let effective_sz = if is_heading { sz + 0.5 } else { sz };
            let col = if is_heading {
                BLACK
            } else {
                (0.25, 0.25, 0.25)
            };

            if clean_line.trim().is_empty() {
                self.dn(advance * 0.4);
                count += 1;
                continue;
            }

            let mut start = 0;
            while start < clean_line.len() {
                if count >= max_lines {
                    self.ensure(advance + 1.0);
                    self.text("...", x, sz, false, C_LABEL);
                    self.dn(advance);
                    break 'outer;
                }
                let end = byte_boundary(clean_line, start + chars);
                let chunk = &clean_line[start..end];
                self.ensure(advance + 1.0);
                self.text(chunk, x, effective_sz, is_heading && start == 0, col);
                self.dn(advance);
                count += 1;
                start = end;
            }
        }
    }

    fn kv_row(&mut self, key: &str, value: &str, bg: (f32, f32, f32)) {
        let row_h = 4.8;
        self.ensure(row_h + 1.0);
        self.rect(ML, self.y + 1.5, CW, row_h, bg);
        self.text(key, ML + 1.5, S_SMALL, true, C_LABEL);
        self.text(value, ML + 1.5 + 30.0, S_SMALL, false, BLACK);
        self.dn(row_h);
    }

    fn save(self) -> Vec<u8> {
        self.doc.save_to_bytes().expect("PDF save failed")
    }

    fn sanitise(s: &str) -> String {
        s.chars()
            .map(|c| if c.is_ascii() { c } else { '?' })
            .collect()
    }

    fn fmt_duration(ms: u64) -> String {
        if ms < 1000 {
            format!("{}ms", ms)
        } else {
            format!("{:.2}s", ms as f64 / 1000.0)
        }
    }
}

fn byte_boundary(s: &str, pos: usize) -> usize {
    if pos >= s.len() {
        return s.len();
    }
    let mut p = pos;
    while p > 0 && !s.is_char_boundary(p) {
        p -= 1;
    }
    p
}

// ─────────────────────────────────────────────────────────────────────────────

pub fn generate(report: &ExecutionReport) -> Vec<u8> {
    let title = format!("Report - {}", report.test_plan_name);
    let mut b = Builder::new(&title);

    // ── Cover header bar ─────────────────────────────────────────────────────
    let hdr_h = 30.0_f32;
    b.rect(0.0, PH, PW, hdr_h, C_HEADER_BG);

    b.y = PH - 8.0;
    b.text("TEST EXECUTION REPORT", ML, S_H1, true, C_HEADER_TXT);
    b.y = PH - 17.0;
    b.text(&report.test_plan_name, ML, S_H2, false, C_HEADER_TXT);

    let status_label = if report.overall_status == OverallStatus::Passed {
        "PASSED"
    } else {
        "FAILED"
    };
    let status_col = if report.overall_status == OverallStatus::Passed {
        C_PASS
    } else {
        C_FAIL
    };
    b.y = PH - 14.0;
    b.badge(status_label, MR - 28.0, status_col);

    b.y = PH - hdr_h - 2.0;

    // ── Metadata row ─────────────────────────────────────────────────────────
    b.dn(6.0);
    let started = report
        .started_at
        .format("%Y-%m-%d %H:%M:%S UTC")
        .to_string();
    let duration_str = Builder::fmt_duration(report.duration_ms);
    b.text(
        &format!(
            "Started: {}   Duration: {}   Report ID: {}",
            started,
            duration_str,
            &report.id[..8]
        ),
        ML,
        S_SMALL,
        false,
        C_LABEL,
    );
    b.dn(5.5);

    // ── Summary stats ────────────────────────────────────────────────────────
    let box_w = 40.0_f32;
    let box_h = 18.0_f32;
    let gap = 5.0_f32;

    let bx = ML;
    b.rect(bx, b.y, box_w, box_h, (0.96, 0.96, 0.99));
    b.text("TOTAL STEPS", bx + 2.0, S_SMALL, true, C_LABEL);
    let saved_y = b.y;
    b.y -= 5.0;
    b.text(
        &report.total_steps.to_string(),
        bx + 2.0,
        16.0,
        true,
        (0.2, 0.2, 0.5),
    );
    b.y = saved_y;

    let bx = ML + box_w + gap;
    b.rect(bx, b.y, box_w, box_h, C_PASS_BG);
    b.text("PASSED", bx + 2.0, S_SMALL, true, C_LABEL);
    let saved_y = b.y;
    b.y -= 5.0;
    b.text(
        &report.passed_steps.to_string(),
        bx + 2.0,
        16.0,
        true,
        C_PASS,
    );
    b.y = saved_y;

    let bx = ML + (box_w + gap) * 2.0;
    b.rect(bx, b.y, box_w, box_h, C_FAIL_BG);
    b.text("FAILED", bx + 2.0, S_SMALL, true, C_LABEL);
    let saved_y = b.y;
    b.y -= 5.0;
    b.text(
        &report.failed_steps.to_string(),
        bx + 2.0,
        16.0,
        true,
        C_FAIL,
    );
    b.y = saved_y;

    let bx = ML + (box_w + gap) * 3.0;
    b.rect(bx, b.y, box_w, box_h, (0.96, 0.96, 0.99));
    b.text("PASS RATE", bx + 2.0, S_SMALL, true, C_LABEL);
    let rate = report
        .passed_steps
        .checked_mul(100)
        .and_then(|value| value.checked_div(report.total_steps))
        .map(|value| format!("{value}%"))
        .unwrap_or_else(|| "N/A".into());
    let saved_y = b.y;
    b.y -= 5.0;
    b.text(&rate, bx + 2.0, 16.0, true, (0.2, 0.2, 0.5));
    b.y = saved_y;

    b.dn(box_h + 6.0);
    b.hline(ML, MR, 0.5, C_RULE);
    b.dn(7.0);

    // ── AI Summary ───────────────────────────────────────────────────────────
    if let Some(ref summary) = report.ai_summary {
        b.ensure(12.0);
        b.text("AI SUMMARY", ML, S_SMALL, true, (0.27, 0.18, 0.65));
        b.dn(1.5);
        b.hline(ML, MR, 0.5, (0.27, 0.18, 0.65));
        b.dn(4.0);

        // Light purple background box
        let saved_y = b.y;
        // We'll draw the bg after measuring, so just render the text
        b.markdown_multiline(summary, ML + 2.0, S_BODY, 80);
        b.dn(3.0);

        // Separator before steps
        b.ensure(5.0);
        b.hline(ML, MR, 0.5, C_RULE);
        b.dn(7.0);

        // Restore y after the bg block
        let _ = saved_y; // bg is drawn inline per line — no pre-draw needed
    }

    // ── Steps ────────────────────────────────────────────────────────────────
    for (i, step) in report.step_results.iter().enumerate() {
        render_step(&mut b, step, i + 1);
    }

    b.save()
}

fn render_step(b: &mut Builder, step: &StepResult, num: usize) {
    b.ensure(20.0);

    let step_col = if step.passed { C_PASS_BG } else { C_FAIL_BG };
    b.rect(ML, b.y + 2.5, CW, 10.0, step_col);
    b.text(
        &format!("{}. {}", num, &step.request_name),
        ML + 2.0,
        S_H3,
        true,
        BLACK,
    );
    let sl = if step.passed { "PASSED" } else { "FAILED" };
    let sc = if step.passed { C_PASS } else { C_FAIL };
    b.badge(sl, MR - 22.0, sc);
    b.dn(5.0);

    // Method + URL — use sanitise + byte_boundary to avoid char boundary panics
    let mw = b.method_badge(&step.request.method, ML + 2.0);
    let url_san = Builder::sanitise(&step.request.url);
    let url_trunc = if url_san.len() > 90 {
        format!("{}...", &url_san[..byte_boundary(&url_san, 87)])
    } else {
        url_san
    };
    b.text(&url_trunc, ML + 2.0 + mw, S_SMALL, false, C_LABEL);
    b.dn(5.5);

    // Error
    if let Some(ref err) = step.error {
        b.ensure(8.0);
        b.rect(ML, b.y + 2.5, CW, 7.0, C_FAIL_BG);
        let msg = Builder::sanitise(err);
        let msg_trunc = if msg.len() > 120 {
            format!("{}...", &msg[..byte_boundary(&msg, 117)])
        } else {
            msg
        };
        b.text(
            &format!("Error: {}", msg_trunc),
            ML + 2.0,
            S_SMALL,
            true,
            C_FAIL,
        );
        b.dn(7.0);
    }

    // ── Request ───────────────────────────────────────────────────────────────
    b.ensure(8.0);
    b.text("REQUEST", ML, S_SMALL, true, (0.3, 0.3, 0.7));
    b.dn(1.5);
    b.hline(ML, ML + CW * 0.5 - 3.0, 0.3, (0.3, 0.3, 0.7));
    b.dn(3.5);

    for h in step.request.headers.iter().take(8) {
        let v = Builder::sanitise(&h.value);
        let v = &v[..v.len().min(80)];
        b.kv_row(&h.key, v, C_REQ_BG);
    }
    if let Some(ref body) = step.request.body
        && !body.is_empty()
    {
        b.ensure(7.0);
        b.text("Body:", ML, S_SMALL, true, C_LABEL);
        b.dn(4.0);
        b.multiline(body, ML + 2.0, S_MONO, (0.2, 0.2, 0.2), 12);
    }
    b.dn(3.0);

    // ── Response ──────────────────────────────────────────────────────────────
    if let Some(ref resp) = step.response {
        b.ensure(8.0);
        b.text("RESPONSE", ML, S_SMALL, true, (0.1, 0.5, 0.3));
        b.dn(1.5);
        b.hline(ML, ML + CW * 0.5 - 3.0, 0.3, (0.1, 0.5, 0.3));
        b.dn(3.5);

        let sc = if resp.status_code < 400 {
            C_PASS
        } else {
            C_FAIL
        };
        b.ensure(5.0);
        b.text(&resp.status_code.to_string(), ML + 2.0, S_BODY, true, sc);
        b.text(
            &format!("  {}", Builder::fmt_duration(resp.duration_ms)),
            ML + 14.0,
            S_BODY,
            false,
            C_LABEL,
        );
        b.dn(5.0);

        for h in resp.headers.iter().take(6) {
            let v = Builder::sanitise(&h.value);
            let v = &v[..v.len().min(80)];
            b.kv_row(&h.key, v, C_RESP_BG);
        }
        if !resp.body.is_empty() {
            b.ensure(7.0);
            b.text("Body:", ML, S_SMALL, true, C_LABEL);
            b.dn(4.0);
            b.multiline(&resp.body, ML + 2.0, S_MONO, (0.15, 0.15, 0.15), 20);
        }
        b.dn(3.0);
    }

    // ── Assertions ────────────────────────────────────────────────────────────
    if !step.assertion_results.is_empty() {
        let passed_n = step.assertion_results.iter().filter(|a| a.passed).count();
        b.ensure(8.0);
        b.text(
            &format!(
                "ASSERTIONS  ({}/{} passed)",
                passed_n,
                step.assertion_results.len()
            ),
            ML,
            S_SMALL,
            true,
            (0.4, 0.2, 0.6),
        );
        b.dn(1.5);
        b.hline(ML, ML + CW * 0.5 - 3.0, 0.3, (0.4, 0.2, 0.6));
        b.dn(3.5);

        for a in &step.assertion_results {
            b.ensure(5.5);
            let bg = if a.passed { C_PASS_BG } else { C_FAIL_BG };
            b.rect(ML, b.y + 1.5, CW, 5.0, bg);
            let tick = if a.passed { "PASS" } else { "FAIL" };
            let col = if a.passed { C_PASS } else { C_FAIL };
            b.text(tick, ML + 1.5, S_BODY, true, col);
            let msg = Builder::sanitise(&a.message);
            let msg_trunc = if msg.len() > 120 {
                format!("{}...", &msg[..byte_boundary(&msg, 117)])
            } else {
                msg
            };
            b.text(&msg_trunc, ML + 10.0, S_SMALL, false, BLACK);
            b.dn(5.0);
        }
        b.dn(2.0);
    }

    // ── Variables ─────────────────────────────────────────────────────────────
    let has_vars = !step.input_variables.is_empty() || !step.output_variables.is_empty();
    if has_vars {
        b.ensure(7.0);
        b.text("VARIABLES", ML, S_SMALL, true, (0.15, 0.35, 0.65));
        b.dn(1.5);
        b.hline(ML, ML + CW * 0.5 - 3.0, 0.3, (0.15, 0.35, 0.65));
        b.dn(3.5);

        for v in &step.input_variables {
            let val = Builder::sanitise(v.value.as_deref().unwrap_or("(unresolved)"));
            b.kv_row(
                &format!("IN  {}", v.name),
                &format!("{} ({})", val, v.source_label),
                C_REQ_BG,
            );
        }
        for v in &step.output_variables {
            let val = Builder::sanitise(v.value.as_deref().unwrap_or("(not extracted)"));
            b.kv_row(&format!("OUT {}", v.name), &val, C_RESP_BG);
        }
        b.dn(2.0);
    }

    // ── Divider ───────────────────────────────────────────────────────────────
    b.ensure(5.0);
    b.hline(ML, MR, 0.5, C_RULE);
    b.dn(7.0);
}
