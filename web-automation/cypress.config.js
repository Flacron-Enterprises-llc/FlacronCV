const { defineConfig } = require("cypress");
const fs = require("fs");
const path = require("path");
const pdf = require("pdf-extraction");

module.exports = defineConfig({
  reporter: "cypress-mochawesome-reporter",
  video: true,

  reporterOptions: {
    reportDir: "cypress/reports/html",
    reportFilename: "[name]-report",
    embeddedScreenshots: true,
    inlineAssets: true,
  },

  projectId: "q86se5",
   numTestsKeptInMemory: 0,

  e2e: {
    
    bail: false, // Ensure this is false or removed
     retries: {
      runMode: 2,
      openMode: 0
    },
     viewportWidth: 1440,

    viewportHeight: 900,
    baseUrl: "https://flacroncv-web.onrender.com/en",
    testIsolation: true,
    downloadsFolder: "cypress/downloads",
    testIsolation: true,
    chromeWebSecurity: false,
    experimentalStudio: true,
    defaultCommandTimeout: 15000,
    pageLoadTimeout: 60000,
    requestTimeout: 15000,
    responseTimeout: 15000,

   
    retries: {
      runMode: 2,
      openMode: 0
    },
    downloadsFolder: "cypress/downloads",
    chromeWebSecurity: false,
    defaultCommandTimeout: 15000,

    setupNodeEvents(on, config) {


      require("cypress-mochawesome-reporter/plugin")(on);

      on("task", {

        // ===============================
        // ✅ Delete Entire Folder
        // ===============================
        deleteFolder(folderName) {
          return new Promise((resolve) => {
            fs.rm(folderName, { recursive: true, force: true }, (err) => {
              if (err) {
                console.warn("Cleanup skipped:", err.message);
              } else {
                console.log("✅ Folder deleted:", folderName);
              }
              resolve(null);
            });
          });
        },

        // ===============================
        // ✅ Get Latest Downloaded PDF
        // ===============================
        getLatestPdf(folderPath = "cypress/downloads") {

          const fullPath = path.resolve(folderPath);

          if (!fs.existsSync(fullPath)) return null;

          const files = fs.readdirSync(fullPath)
            .filter(f => f.endsWith(".pdf"))
            .map(f => ({
              name: f,
              path: path.join(fullPath, f),
              time: fs.statSync(path.join(fullPath, f)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time);

          return files.length ? files[0].path : null;
        },

        // ===============================
        // ✅ Read PDF Content
        // ===============================
        async readPdf(filePath) {

          const fullPath = path.resolve(filePath);

          if (!fs.existsSync(fullPath)) {
            throw new Error("❌ File not found: " + fullPath);
          }

          const dataBuffer = fs.readFileSync(fullPath);
          const data = await pdf(dataBuffer);

          return data.text;
        },

        // ===============================
        // ✅ Delete Specific File (Safe Retry)
        // ===============================
        deleteFile(filePath) {

          const fullPath = path.resolve(filePath);

          const sleep = (ms) => new Promise(r => setTimeout(r, ms));

          const removeFile = async () => {

            if (!fs.existsSync(fullPath)) return null;

            let attempts = 5;

            while (attempts > 0) {
              try {
                fs.unlinkSync(fullPath);
                console.log("✅ Deleted file:", fullPath);
                break;
              } catch (err) {
                if (attempts === 1) {
                  console.warn("⚠ File locked, skipped:", fullPath);
                }
                await sleep(500);
                attempts--;
              }
            }

            return null;
          };

          return removeFile();
        },

        // ===============================
        // ✅ Clear Entire Downloads Folder
        // ===============================
        clearDownloadsFolder(folderPath = "cypress/downloads") {

          const fullPath = path.resolve(folderPath);
          const sleep = (ms) => new Promise(r => setTimeout(r, ms));

          const deleteFiles = async () => {

            if (!fs.existsSync(fullPath)) return null;

            const files = fs.readdirSync(fullPath);

            for (const file of files) {

              const filePath = path.join(fullPath, file);
              let attempts = 5;

              while (attempts > 0) {
                try {
                  fs.unlinkSync(filePath);
                  console.log("✅ Deleted:", file);
                  break;
                } catch (err) {

                  if (attempts === 1) {
                    console.warn("⚠ Skipped (locked):", file);
                  }

                  await sleep(500);
                  attempts--;
                }
              }
            }

            return null;
          };

          return deleteFiles();
        }

      });

      return config;
    }
  },

  env: {
    
    MAILSLURP_API_KEY: "sk_uX8P4Ft8CSzkJTf7_PQtJAV8h57l6Fyc0u8xZ1m4J3hlEtH0fu4iAgdOsPW8lscFN9IPYivfNl31PlqFy",

  }
});