function doGet() {
  return HtmlService
    .createHtmlOutputFromFile('Index')
    .setTitle('Hospital Web App Demo')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
