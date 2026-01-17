const { defineConfig } = require("cypress");
const fs = require("fs");
const path = require("path");

module.exports = defineConfig({
  projectId: "q86se5",


  reporter: "cypress-mochawesome-reporter",
  video: true,

  reporterOptions: {
    overwrite: false,
    html: true,
    json: true,
    reportDir: "cypress/reports/html",
    reportFilename: `report-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    reportPageTitle: "Test Report",
    embeddedScreenshots: true,
    inlineAssets: true,
    saveAllAttempts: true
  },

  e2e: {
    baseUrl: "https://flacroncv.onrender.com",   // ✅ CORRECT PLACE
    downloadsFolder: "cypress/downloads",       // ✅ CORRECT PLACE

    chromeWebSecurity: false,
    experimentalStudio: true,

    defaultCommandTimeout: 15000,
    pageLoadTimeout: 60000,
    requestTimeout: 15000,
    responseTimeout: 15000,

    setupNodeEvents(on, config) {

      // Mochawesome plugin
      require("cypress-mochawesome-reporter/plugin")(on);
       
      // Custom task for downloaded files
      on("task", {
        getDownloadedFiles() {
          const downloadDir = path.join(__dirname, "cypress/downloads");
          return fs.existsSync(downloadDir)
            ? fs.readdirSync(downloadDir)
            : [];
        }
      });

      return config;
    }
  }
});

