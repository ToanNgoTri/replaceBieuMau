import PizZip from 'pizzip';

/** Các phần XML của .docx có chứa nội dung hiển thị. */
const PART_RE = /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/;

export function loadDocx(buffer) {
  return new PizZip(buffer);
}

/** Liệt kê các part cần quét: thân bài + header + footer + chú thích. */
export function listParts(zip) {
  return Object.keys(zip.files).filter((name) => PART_RE.test(name)).sort();
}

export function readPart(zip, name) {
  return zip.file(name).asText();
}

export function writePart(zip, name, xml) {
  zip.file(name, xml);
}

export function saveDocx(zip) {
  return zip.generate({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
