// cypress/e2e/skills.cy.js
// Test Suite: FlacronCV - Skills Section + Preview + Toolbar
// Pattern: POM | Simple & Easy to Understand

import SkillsPage from '../../pages/skillsPage';
import createNewCVPage from '../../pages/createNewCVPage';
//import { buildPdfFileName } from '../../support/pdfHelper'; //for geting project name
import { slowCypressDown } from 'cypress-slow-down'
import authPage from '../../pages/loginPage'
import {faker} from '@faker-js/faker'  //faker for fack data for testing
import logout from '../../pages/logout'

// import all data json file from fixtures folder

import headerPage from '../../pages/topMenu'
import signUpData from '../../fixtures/signUpData.json'
import skillsPage from '../../pages/skillsPage';
const loginObj = new authPage()
const headerObj = new headerPage()
const templateObj = new createNewCVPage()
const logoutObj = new logout()


// ─────────────────────────────────────────────────────────────────────────────
describe('FlacronCV - Validating Selecting CV template,creating new CV and validate it', () => {

    beforeEach(() => {
cy.task("clearDownloadsFolder");
    
      cy.clearCookies();
      cy.clearLocalStorage();
      cy.window().then((win) => {
        win.sessionStorage.clear();
       
      });
          

       cy.log("======= Testing SignUp ======")
        cy.log("======= Open Web application ======")
        cy.visit('/')
        cy.visit('/login')
 
      cy.wait(300)

     cy.url().then((currentUrl) => {

      cy.log('url is' + currentUrl)
    
    // SCENARIO 1: On Dashboard - Logout and Re-login
    if (currentUrl.includes('/dashboard')) {
        cy.log('👉 Scenario: Already on Dashboard - Resetting via Logout');
       cy.wait(300)
        logoutObj.logoutMain();
         cy.wait(300)
        cy.reload(); 
         cy.wait(300)
        
        cy.visit('/login');
        loginObj.enterValidEmail(signUpData.email);
        cy.wait(300);
        loginObj.enterPassword(signUpData.password);
        cy.wait(300);
        loginObj.clickButton();
    } 

    // SCENARIO 2: On Login Page - Direct Login
    else if(currentUrl.includes('/login')) {
        cy.log('👉 Scenario: Already on Login Page');
         cy.wait(300);
        loginObj.enterValidEmail(signUpData.email);
        cy.wait(300);
        loginObj.enterPassword(signUpData.password);
        cy.wait(300);
        loginObj.clickButton();
    } 

    // SCENARIO 3: Landing Page or any other URL
    else{
        cy.log('👉 Scenario: On Landing Page - Navigating to Login');
        cy.visit('/login');
        
        loginObj.enterValidEmail(signUpData.email);
        cy.wait(300);
        loginObj.enterPassword(signUpData.password);
        cy.wait(300);
        loginObj.clickButton();
    }

    // --- REMAINING TASK EXECUTION ---
    loginObj.validateDashboard();
    
    templateObj.visit();
    cy.wait(500);
    
    const title = faker.person.jobTitle();
    templateObj.enterCVTitle(title);
    cy.wrap(title).as('title');

    templateObj.selectRandomFreeTemplate();
    cy.wait(500);
    
    templateObj.clickCreateCV();
    cy.wait(500);
    
    templateObj.validateConfirmationMsg();
    cy.wait(300);
});
      /*
        cy.log("======= Testing SignUp ======")
        cy.log("======= Open Web application ======")
          
       
             loginObj.enterValidEmail(signUpData.email)
        
             cy.wait(300)
            loginObj.enterPassword(signUpData.password);
            cy.wait(300)
            loginObj.clickButton()
            loginObj.validateDashboard()
        
              templateObj.visit()
     cy.wait(500)
             const title = faker.person.jobTitle()
                templateObj.enterCVTitle(title)
              cy.wrap(title).as('title')
     
             templateObj.selectRandomFreeTemplate();
     cy.wait(500)
             // Verify the selection (usually the border color changes)
             // From your HTML: border-brand-500 or similar highlight classes
             cy.log('======= Template Selected Successfully =======');
     
             // Proceed to create
             templateObj.clickCreateCV();
     
             cy.wait(500)
     
             // Final assertion: Check if we moved to the editor page
           //  cy.url().should('include', '/editor');
             templateObj.validateConfirmationMsg()
     
             cy.wait(300)

             */
     
        })
  
        slowCypressDown(800) 
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP 1: PAGE LOAD & FIELD VISIBILITY
  // ═══════════════════════════════════════════════════════════════════════════
it('TC:01: varify Email should displayed correct on Create new CV page',{ retries: 2 },()=>{


  // Use the same data you used at the time of registration
        const regEmail = signUpData.email 
       
        // Assert that the fields are pre-filled correctly
        
        skillsPage.verifyRegistrationData(regEmail);
        
           logoutObj.logoutMain()

})

it('TC-2: Upload and verify valid PNG image', { retries: 2 },()=>{

  skillsPage.uploadValidImagePng()
   logoutObj.logoutMain()
  


})

it('TC-3: Upload and verify valid JPG image',{ retries: 2 }, ()=>{

  skillsPage.uploadValidImageJpg()

   logoutObj.logoutMain()


})

it('TC-4: Upload and verify invalid image/file',{ retries: 1 }, ()=>{

  skillsPage.uploadInvaidImageFile()

   logoutObj.logoutMain()


})

it('TC-5 : Add Personal Information, experiance,education and all other sections', { retries: 2 },()=>{

  
    cy.log("======= Entring Data in Personal Information ======")
  
    skillsPage.uploadValidImageJpg()
    skillsPage.fillFirstName(faker.person.firstName())
    cy.get('@typedFirstName').then((expectedValue) => {
          cy.get(skillsPage.weblocators.previewWin)
            .should('be.visible')
            .and('contain.text', expectedValue);
      });
  
    skillsPage.fillLastName(faker.person.lastName())
    cy.get('@typedLastName').then((expectedValue) => {
          cy.get(skillsPage.weblocators.previewWin)
            .should('be.visible')
            .and('contain.text', expectedValue);
      });
  
  
    skillsPage.fillPhone(faker.phone.number())
    cy.get('@typedPH').then((expectedValue) => {
          cy.get(skillsPage.weblocators.previewWin)
            .should('be.visible')
            .and('contain.text', expectedValue);
      });
  
    skillsPage.fillCity(faker.location.city())
    cy.get('@typedCity').then((expectedValue) => {
          cy.get(skillsPage.weblocators.previewWin)
            .should('be.visible')
            .and('contain.text', expectedValue);
      });
  
    skillsPage.fillCountry(faker.location.country())
      cy.get('@typedCountry').then((expectedValue) => {
          cy.get(skillsPage.weblocators.previewWin)
            .should('be.visible')
            .and('contain.text', expectedValue);
      })
  
  
    skillsPage.checkHeadline(faker.person.jobTitle())
    cy.get('@typedHL').then((expectedValue) => {
          cy.get(skillsPage.weblocators.previewWin)
            .should('be.visible')
            .and('contain.text', expectedValue);
      })
  
  // Now call the alias
  skillsPage.storeProfessionalSummary()
      cy.get('@capturedSummary').then((savedText) => {
          cy.get(skillsPage.weblocators.previewWin).should('contain.text', savedText);
      });
  
    skillsPage.fillLinkedin('https://www.linkedin.com/in/asad-ibrahim-mastoi/')
    cy.get('@typedLinkedIn').then((expectedValue) => {
          cy.get(skillsPage.weblocators.previewWin)
            .should('be.visible')
            .and('contain.text', expectedValue);
      })
  
    skillsPage.fillWebsite(faker.internet.url())
    cy.get('@typedWebsite').then((expectedValue) => {
          cy.get(skillsPage.weblocators.previewWin)
            .should('be.visible')
            .and('contain.text', expectedValue);
      })
    cy.wait(200)
    //add Experiance
  
    
    cy.log("======= Adding Experiance ======")
      skillsPage.clickAndAddExp()
  
      skillsPage.addExpPosition(faker.person.jobTitle())
  
       cy.get('@position').then((expectedValue) => {
          cy.get(skillsPage.weblocators.previewWin)
            .should('be.visible')
            .and('contain.text', expectedValue);
      })
  
      skillsPage.enterExpCompany(faker.company.buzzVerb())
        cy.get('@company').then((expectedValue) => {
          cy.get(skillsPage.weblocators.previewWin)
            .should('be.visible')
            .and('contain.text', expectedValue);
      })
  
  
      skillsPage.selectSDate('2006-06')
      
       cy.get('@sdate').then((expectedValue) => {
 
        const input = expectedValue;

const date = new Date(input + "-01"); // add day to make valid date

const formatted = date.toLocaleString('en-US', {
  month: 'short',
  year: 'numeric'
});

cy.log(formatted); // Jun 2006
          cy.get(skillsPage.weblocators.previewWin)
            .should('be.visible')
            .and('contain.text', formatted);
      })
  
      skillsPage.selectEDate('2008-08')

      cy.get('@edate').then((expectedValue2) => {
  
        const input = expectedValue2

        const date = new Date(input + "-01"); // add day to make valid date

        const formatted = date.toLocaleString('en-US', {
         month: 'short',
         year: 'numeric'
        });

        cy.log(formatted); // Jun 2006
          cy.get(skillsPage.weblocators.previewWin)
            .should('be.visible')
            .and('contain.text', formatted);
   
      })
  
      
      skillsPage.enterJobDescription(faker.lorem.paragraph())
      cy.get('@jobdescription').then((expectedValue) => {
          cy.get(skillsPage.weblocators.previewWin)
            .should('be.visible')
            .and('contain.text', expectedValue);
      })
  
      cy.wait(200)
  
      cy.log("======= Adding Education ======")
  
      skillsPage.clickAddEduButton()
      skillsPage.enterDeg('BS')
  
      skillsPage.enterFieldOFStudy('Science')
      
  
      skillsPage.enterInstitution('NICE')
  
      //validate degree
       cy.get('@deg').then((expectedValue) => {
          cy.get(skillsPage.weblocators.previewWin)
            .should('be.visible')
            .and('contain.text', expectedValue);
      })
  
  
      ///validate degree
       cy.get('@FOS').then((expectedValue) => {
          cy.get(skillsPage.weblocators.previewWin)
            .should('be.visible')
            .and('contain.text', expectedValue);
      })
  
  
       cy.get('@institution').then((expectedValue) => {
          cy.get(skillsPage.weblocators.previewWin)
            .should('be.visible')
            .and('contain.text', expectedValue);
      })
  
      skillsPage.enterStartEnd('2001-2005')
       cy.get('@startEnd').then((expectedValue) => {

        
          cy.get(skillsPage.weblocators.previewWin)
            .should('be.visible')
            .and('contain.text', expectedValue);
            
      })
  
       cy.log("======= Adding Skill ======")
       skillsPage.addSkill()
    
       skillsPage.enterSkillName('AI')
        cy.get('@skillName').then((expectedValue) => {
          cy.get(skillsPage.weblocators.previewWin)
            .should('be.visible')
            .and('contain.text', expectedValue);
      })
  
   
       cy.log("======= clicking Adding 1st Section button ======")
  
      skillsPage.clickAddSecBut()
  
    cy.log("======= Selecting project section ======")
  
    skillsPage.selectProjectSection()
    
          
    cy.log("======= clicking add item button in project ======")
     skillsPage.clickAddItemProjectButt()
  
  
       skillsPage.enterProjectTitle('AI')
  
        cy.get('@proTitle').then((expectedValue) => {
          cy.get(skillsPage.weblocators.previewWin)
            .should('be.visible')
            .and('contain.text', expectedValue);
      })
  
       skillsPage.enterDescription('This is AI related priject')
        cy.get('@proDesc').then((expectedValue) => {
          cy.get(skillsPage.weblocators.previewWin)
            .should('be.visible')
            .and('contain.text', expectedValue);
      })
  
  
  
     cy.wait(200)
  
       cy.log("======= Adding certificate section ======")
       
       skillsPage.addingCertificate()
  
         skillsPage.addLanguageSection()
  
          cy.log("======= Adding Ref section ======")
          
          skillsPage.addRefSection()
  
  cy.log("======= Adding Custom section ======")
   
   skillsPage.addCustomSection()
  
  // validate all data on preview window

   logoutObj.logoutMain()


})


  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP 4: REMOVE SKILL
  // ═══════════════════════════════════════════════════════════════════════════
it('TC-6: Should remove a skill row by clicking Remove',{ retries: 2 }, () => {


  // Step 1: Go up to the section container that wraps ALL skill rows
 

  cy.get('input[value="JavaScript"]').invoke('val').as('skillName')

    skillsPage.removeSkill()

       cy.get('@skillName').then((expectedValue) => {
        cy.get(skillsPage.weblocators.previewWin)
          .should('be.visible')
          .and('not.contain.text', expectedValue);
    })


    cy.log('✅ Skill row removed successfully');
     logoutObj.logoutMain()
  });

it('TC-7: Skill input and dropdown should have same height in each row', { retries: 2 },() => {

  cy.get('.grid.gap-2').each(($row, index) => {

    const input    = $row.find('input.input-field')
    const dropdown = $row.find('select.input-field')

    // Only process rows that have BOTH input and dropdown
    if (input.length === 0 || dropdown.length === 0) return

    const inputHeight    = input[0].getBoundingClientRect().height
    const dropdownHeight = dropdown[0].getBoundingClientRect().height
    const inputWidth     = input[0].getBoundingClientRect().width
    const dropdownWidth  = dropdown[0].getBoundingClientRect().width

    cy.log(`Row [${index}] input    → width: ${inputWidth}px  | height: ${inputHeight}px`)
    cy.log(`Row [${index}] dropdown → width: ${dropdownWidth}px | height: ${dropdownHeight}px`)

    // ✅ Height must match between input and dropdown in same row
    expect(inputHeight).to.equal(
      dropdownHeight,
      `Row [${index}] height mismatch — input: ${inputHeight}px | dropdown: ${dropdownHeight}px`
    )
  })
logoutObj.logoutMain()

})

it('TC-8: Clicking eye icon should hide Experiance section from preview and unhide',{ retries: 2 }, () => {

  skillsPage.clickEyeExperiance()
  
 

  // Step 4: Verify Skills section heading NOT visible in preview
  cy.get(skillsPage.weblocators.previewWin)
    .should('not.contain.text', 'Experience')
    cy.wait(100)
    
  skillsPage.clickEyeExperiance()

  cy.get(skillsPage.weblocators.previewWin)
    .should('contain.text', 'Experience')
logoutObj.logoutMain()
  
})


it('TC-9: Clicking delete icon should delete Experiance section from preview',{ retries: 2 }, () => {

  skillsPage.clickDeleteExperiance()
  
   // Step 4: Verify Skills section heading NOT visible in preview
  cy.get(skillsPage.weblocators.previewWin)
    .should('not.contain.text', 'Experience')
    cy.wait(100)


logoutObj.logoutMain()
  
})

it.skip('TC-11: Selected font should apply to preview window', { retries: 3 },() => {

  const fontName = 'Inter'

  // Step 1: Open font section
  cy.get(':nth-child(4) > .flex > .hidden').click()
  cy.get('select').should('be.visible')

  // Step 2: Select body font
  cy.get('select').eq(0).select(fontName, { force: true })
  cy.log(`Body font set to: ${fontName}`)

  // Step 3: Select heading font
  cy.get('select').eq(1).select(fontName, { force: true })
  cy.log(`Heading font set to: ${fontName}`)

  // Step 4: Bypass overlay — read font directly from DOM via window()
  cy.window().then((win) => {
    const previewEl = win.document.querySelector('#cv-preview-content')
    const computedFont = win.getComputedStyle(previewEl).fontFamily
    const cleanFont = computedFont.replace(/['"]+/g, '').toLowerCase()

    cy.log(`Computed font-family from preview: ${cleanFont}`)
    expect(cleanFont).to.include(fontName.toLowerCase())
  })
  logoutObj.logoutMain()
})



  // ═══════════════════════════════════════════════════════════════════════════
  // GROUP 6: EXPORT
  // ═══════════════════════════════════════════════════════════════════════════

  it('TC-10 | Export button should open dropdown with PDF and export PDF successfully',{ retries: 2 }, () => {
  
  
  cy.log("======= Entring Data in Personal Information ======")

  skillsPage.uploadValidImageJpg()
  skillsPage.fillFirstName(faker.person.firstName())
  cy.get('@typedFirstName').then((expectedValue) => {
        cy.get(skillsPage.weblocators.previewWin)
          .should('be.visible')
          .and('contain.text', expectedValue);
    });

  skillsPage.fillLastName(faker.person.lastName())
  cy.get('@typedLastName').then((expectedValue) => {
        cy.get(skillsPage.weblocators.previewWin)
          .should('be.visible')
          .and('contain.text', expectedValue);
    });


  skillsPage.fillPhone(faker.phone.number())
  cy.get('@typedPH').then((expectedValue) => {
        cy.get(skillsPage.weblocators.previewWin)
          .should('be.visible')
          .and('contain.text', expectedValue);
    });

  skillsPage.fillCity(faker.location.city())
  cy.get('@typedCity').then((expectedValue) => {
        cy.get(skillsPage.weblocators.previewWin)
          .should('be.visible')
          .and('contain.text', expectedValue);
    });

  skillsPage.fillCountry(faker.location.country())
    cy.get('@typedCountry').then((expectedValue) => {
        cy.get(skillsPage.weblocators.previewWin)
          .should('be.visible')
          .and('contain.text', expectedValue);
    })


  skillsPage.checkHeadline(faker.person.jobTitle())
  cy.get('@typedHL').then((expectedValue) => {
        cy.get(skillsPage.weblocators.previewWin)
          .should('be.visible')
          .and('contain.text', expectedValue);
    })

// Now call the alias
skillsPage.storeProfessionalSummary()
    cy.get('@capturedSummary').then((savedText) => {
        cy.get(skillsPage.weblocators.previewWin).should('contain.text', savedText);
    });

  skillsPage.fillLinkedin('https://www.linkedin.com/in/asad-ibrahim-mastoi/')
  cy.get('@typedLinkedIn').then((expectedValue) => {
        cy.get(skillsPage.weblocators.previewWin)
          .should('be.visible')
          .and('contain.text', expectedValue);
    })

  skillsPage.fillWebsite(faker.internet.url())
  cy.get('@typedWebsite').then((expectedValue) => {
        cy.get(skillsPage.weblocators.previewWin)
          .should('be.visible')
          .and('contain.text', expectedValue);
    })
  cy.wait(200)
 
   // ===== EXPORT PDF =====
SkillsPage.clickExpertButton();
cy.wait(500);
SkillsPage.clickExportPDF();
cy.wait(500)
skillsPage.varifyMsg()

cy.wait(500)


cy.get('@title').then((projectName) => {
    
    
   // const sanitizedName = projectName.replace(/-/g, '_');
      const normalizePdfText = (text) =>
  text
    .replace(/\s+/g, " ")
    .replace(/[^\w\s:/.-]/g, "")
    .toLowerCase()
    .trim();


    // 3. Define the path INSIDE this block
   cy.wait(400)
    cy.log(`File name: ${projectName} `);
    cy.wait(400)
    const filePath = `cypress/downloads/${projectName}.pdf`;
    cy.wait(400)
    cy.log('Target PDF Path: ' + filePath);
/*
   cy.wait(400)

    // 4. Perform the file check and PDF reading INSIDE this block
    cy.readFile(filePath, { timeout: 20000 }).should('exist');
    
     const downloadsFolder = "cypress/downloads";


  // 1. Resolve all aliases (Careful with the nesting!)
cy.get('@typedFirstName').then((firstName) => {
 /*cy.get('@typedLastName').then((lastName) => {
  cy.get('@typedPH').then((ph) => {
   cy.get('@typedCity').then((city) => {
    cy.get('@typedCountry').then((country) => {
     cy.get('@typedHL').then((hl) => {
      cy.get('@capturedSummary').then((summery) => {
       cy.get('@typedLinkedIn').then((linkedIn) => {
        cy.get('@typedWebsite').then((website) => {
         cy.get('@position').then((position) => {
          cy.get('@company').then((company) => {
           cy.get('@jobdescription').then((jobd) => {
            cy.get('@deg').then((deg) => {
             cy.get('@FOS').then((FOS) => {
              cy.get('@institution').then((institution) => {
               cy.get('@skillName').then((skill) => {
                cy.get('@proTitle').then((proTitle) => {
                 cy.get('@proDesc').then((proDesc) => {

                  
                  const downloadsFolder = "cypress/downloads";

                  // 2. Read the PDF
                  cy.task("getLatestPdf", downloadsFolder).then((latestPath) => {
                    cy.task("readPdf", latestPath).then((extractedText) => {
                      
                      const pdfContent = extractedText.replace(/\s+/g, ' ').toLowerCase();
                      // 3. ACTUAL DATA VALIDATION
            // We verify that the VALUE we saved is present in the PDF

             
            cy.log(`Validating Actual Data: ${institution},${linkedIn},${website},${proDesc},${proTitle},${skill},${firstName},${FOS}, ${deg},${company},${jobd},${position}, ${company}, ${summery}, ${hl},${lastName}, ${ph}, ${city}, ${country}`);

    // Assertions
    expect(pdfContent, 'first name').to.include(firstName.toLowerCase())
    expect(pdfContent, 'last name').to.include(lastName.toLowerCase())
    expect(pdfContent, 'phone').to.include(ph)
    expect(pdfContent, 'city').to.include(city.toLowerCase())
    expect(pdfContent, 'country').to.include(country.toLowerCase())
    expect(pdfContent, 'headline').to.include(hl.toLowerCase())
    expect(pdfContent, 'summary').to.include(summery.toLowerCase())
    expect(pdfContent, 'position').to.include(position.toLowerCase())
    expect(pdfContent, 'company').to.include(company.toLowerCase())
    expect(pdfContent, 'job description').to.include(jobd.toLowerCase())
    expect(pdfContent, 'degree').to.include(deg.toLowerCase())
    expect(pdfContent, 'field of study').to.include(FOS.toLowerCase())
    expect(pdfContent, 'institution').to.include(institution.toLowerCase())
    expect(pdfContent, 'skill').to.include(skill.toLowerCase())
    expect(pdfContent, 'project title').to.include(proTitle.toLowerCase())
    expect(pdfContent, 'project description').to.include(proDesc.toLowerCase())
     expect(pdfContent, 'project description').to.include(website.toLowerCase())
      expect(pdfContent, 'project description').to.include(linkedIn.toLowerCase())

    cy.log('✅ SUCCESS: PDF contains all entered data')
 // })
})
*/
//})
//})
})
/*
})})})})})})})})})})})})})})})})*/
// ===== LOGOUT =====
logoutObj.logoutMain();
});

  it('TC- 11: Should click Export as DOCX without error',{ retries: 2 }, () => {
      
  cy.log("======= Entring Data in Personal Information ======")

  skillsPage.uploadValidImageJpg()
  skillsPage.fillFirstName(faker.person.firstName())
  cy.get('@typedFirstName').then((expectedValue) => {
        cy.get(skillsPage.weblocators.previewWin)
          .should('be.visible')
          .and('contain.text', expectedValue);
    });

  skillsPage.fillLastName(faker.person.lastName())
  cy.get('@typedLastName').then((expectedValue) => {
        cy.get(skillsPage.weblocators.previewWin)
          .should('be.visible')
          .and('contain.text', expectedValue);
    });


  skillsPage.fillPhone(faker.phone.number())
  cy.get('@typedPH').then((expectedValue) => {
        cy.get(skillsPage.weblocators.previewWin)
          .should('be.visible')
          .and('contain.text', expectedValue);
    });

  skillsPage.fillCity(faker.location.city())
  cy.get('@typedCity').then((expectedValue) => {
        cy.get(skillsPage.weblocators.previewWin)
          .should('be.visible')
          .and('contain.text', expectedValue);
    });

  skillsPage.fillCountry(faker.location.country())
    cy.get('@typedCountry').then((expectedValue) => {
        cy.get(skillsPage.weblocators.previewWin)
          .should('be.visible')
          .and('contain.text', expectedValue);
    })


  skillsPage.checkHeadline(faker.person.jobTitle())
  cy.get('@typedHL').then((expectedValue) => {
        cy.get(skillsPage.weblocators.previewWin)
          .should('be.visible')
          .and('contain.text', expectedValue);
    })

// Now call the alias
skillsPage.storeProfessionalSummary()
    cy.get('@capturedSummary').then((savedText) => {
        cy.get(skillsPage.weblocators.previewWin).should('contain.text', savedText);
    });

  skillsPage.fillLinkedin('https://www.linkedin.com/in/asad-ibrahim-mastoi/')
  cy.get('@typedLinkedIn').then((expectedValue) => {
        cy.get(skillsPage.weblocators.previewWin)
          .should('be.visible')
          .and('contain.text', expectedValue);
    })

  skillsPage.fillWebsite(faker.internet.url())
  cy.get('@typedWebsite').then((expectedValue) => {
        cy.get(skillsPage.weblocators.previewWin)
          .should('be.visible')
          .and('contain.text', expectedValue);
    })
  cy.wait(200)
   // ===== EXPORT PDF =====
SkillsPage.clickExpertButton();
cy.wait(500);
SkillsPage.clickexportdoc();
cy.wait(500)
skillsPage.varifyMsgDOX()

cy.wait(500)


cy.get('@title').then((projectName) => {
    
    
   // const sanitizedName = projectName.replace(/-/g, '_');
      const normalizePdfText = (text) =>
  text
    .replace(/\s+/g, " ")
    .replace(/[^\w\s:/.-]/g, "")
    .toLowerCase()
    .trim();


    // 3. Define the path INSIDE this block
   cy.wait(400)
    cy.log(`File name: ${projectName} `);
    cy.wait(400)
    const filePath = `cypress/downloads/${projectName}.docx`;
    cy.wait(400)
    cy.log('Target DOCX Path: ' + filePath);

   cy.wait(400)
/*
    // 4. Perform the file check and PDF reading INSIDE this block
    cy.readFile(filePath, { timeout: 20000 }).should('exist');
    
     const downloadsFolder = "cypress/downloads";


  // 1. Resolve all aliases (Careful with the nesting!)
cy.get('@typedFirstName').then((firstName) => {
 /*cy.get('@typedLastName').then((lastName) => {
  cy.get('@typedPH').then((ph) => {
   cy.get('@typedCity').then((city) => {
    cy.get('@typedCountry').then((country) => {
     cy.get('@typedHL').then((hl) => {
      cy.get('@capturedSummary').then((summery) => {
       cy.get('@typedLinkedIn').then((linkedIn) => {
        cy.get('@typedWebsite').then((website) => {
         cy.get('@position').then((position) => {
          cy.get('@company').then((company) => {
           cy.get('@jobdescription').then((jobd) => {
            cy.get('@deg').then((deg) => {
             cy.get('@FOS').then((FOS) => {
              cy.get('@institution').then((institution) => {
               cy.get('@skillName').then((skill) => {
                cy.get('@proTitle').then((proTitle) => {
                 cy.get('@proDesc').then((proDesc) => {

                  
                  const downloadsFolder = "cypress/downloads";

                  // 2. Read the PDF
                  cy.task("getLatestDocx", downloadsFolder).then((latestPath) => {
                    cy.task("readDocx", latestPath).then((extractedText) => {
                      
                      const docxContent = extractedText.replace(/\s+/g, ' ').toLowerCase();
                      // 3. ACTUAL DATA VALIDATION
            // We verify that the VALUE we saved is present in the PDF

             
            cy.log(`Validating Actual Data: ${institution},${linkedIn},${website},${proDesc},${proTitle},${skill},${firstName},${FOS}, ${deg},${company},${jobd},${position}, ${company}, ${summery}, ${hl},${lastName}, ${ph}, ${city}, ${country}`);

    // Assertions
    expect(docxContent, 'first name').to.include(firstName.toLowerCase())
   /* expect(pdfContent, 'last name').to.include(lastName.toLowerCase())
    expect(pdfContent, 'phone').to.include(ph)
    expect(pdfContent, 'city').to.include(city.toLowerCase())
    expect(pdfContent, 'country').to.include(country.toLowerCase())
    expect(pdfContent, 'headline').to.include(hl.toLowerCase())
    expect(pdfContent, 'summary').to.include(summery.toLowerCase())
    expect(pdfContent, 'position').to.include(position.toLowerCase())
    expect(pdfContent, 'company').to.include(company.toLowerCase())
    expect(pdfContent, 'job description').to.include(jobd.toLowerCase())
    expect(pdfContent, 'degree').to.include(deg.toLowerCase())
    expect(pdfContent, 'field of study').to.include(FOS.toLowerCase())
    expect(pdfContent, 'institution').to.include(institution.toLowerCase())
    expect(pdfContent, 'skill').to.include(skill.toLowerCase())
    expect(pdfContent, 'project title').to.include(proTitle.toLowerCase())
    expect(pdfContent, 'project description').to.include(proDesc.toLowerCase())
     expect(pdfContent, 'project description').to.include(website.toLowerCase())
      expect(pdfContent, 'project description').to.include(linkedIn.toLowerCase())

    cy.log('✅ SUCCESS: PDF contains all entered data')
 // })
})
*/
})
// })})
/*
})})})})})})})})})})})})})})})})*/
// ===== LOGOUT =====
logoutObj.logoutMain();
  });

  
  it('TC- 12:AI Assist button should not displayed on page', { retries: 1 },() => {
   
   
    SkillsPage.clickAIAssist();

       logoutObj.logoutMain()

  });

   it('TC- 13: validate back and forward arrow button should work as expected', { retries: 1 },() => {
   
   
  skillsPage.clickDeleteExperiance()
  
   // Step 4: Verify Skills section heading NOT visible in preview
  cy.get(skillsPage.weblocators.previewWin)
    .should('not.contain.text', 'Experience')
    cy.wait(100)

    
    skillsPage.clickUndo()
     cy.get(skillsPage.weblocators.previewWin)
    .should('contain.text', 'Experience')

  
logoutObj.logoutMain()


  });

  
});