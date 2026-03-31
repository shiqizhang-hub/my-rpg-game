function doGet() {
  return HtmlService
    .createHtmlOutputFromFile('Index')
    .setTitle('Hospital Exploration Prototype')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
