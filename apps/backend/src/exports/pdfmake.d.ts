// pdfmake 0.3 ships no types. Only the server-side surface used by the PDF report is declared.
declare module 'pdfmake' {
  interface OutputDocument {
    getBuffer(): Promise<Buffer>;
  }
  interface PdfMake {
    setFonts(fonts: Record<string, Record<string, string>>): void;
    createPdf(definition: object): OutputDocument;
  }
  const pdfmake: PdfMake;
  export default pdfmake;
}
