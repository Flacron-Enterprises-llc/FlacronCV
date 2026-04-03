// pages/SkillsPage.js
// POM for FlacronCV - Skills Section + Preview Panel + Toolbar Features
// Based on actual HTML from the app

class SkillsPage {

        
    //Locators
    

    weblocators={

    firstName: '.shadow-sm > .grid > :nth-child(1) > .input-field',
    lastName: 'input[placeholder="Your last name"]',
    email: 'input[type="email"]',
    image: 'input[type="file"]',
    flnameP: 'div[id="cv-preview-content"] div div h1',
    previewWin: '#cv-preview-content > div',
    imageDeleteIcon: '.lucide.lucide-x.h-3.w-3',
    profileImagePro: 'div[id="cv-preview-content"] div div img[alt="Profile"]',
    ph: '.shadow-sm > .grid > :nth-child(4) > .input-field',
    city: ':nth-child(5) > .input-field',
    country: ':nth-child(6) > .input-field',
    headLine: '[placeholder="e.g. Senior Software Engineer"]',
    summary: ':nth-child(8) > .input-field',
    linkedIn: ':nth-child(9) > .input-field',
    website: '[placeholder="yoursite.com"]',
    profession: '[placeholder="e.g. Software Engineer"]',
    expertLevel: 'div.space-y-4 > div > select.rounded-lg',
    addSkills: 'body > div:nth-child(1) > div:nth-child(2) > main:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(4) > div:nth-child(2) > div:nth-child(1) > button:nth-child(11)',
    skillName: 'body > div:nth-child(1) > div:nth-child(2) > main:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(4) > div:nth-child(2) > div:nth-child(1) > div:nth-child(11) > div:nth-child(1) > div:nth-child(1) > input:nth-child(2)',
    skillLevelDropdown: ':nth-child(11) > .grid > select.input-field',

    keySkills: 'input[type="text"][placeholder="e.g. JavaScript, Project Management, Communication"]',
    carrerGole: 'textarea[placeholder="e.g. Seeking a senior developer role at a tech company"]',
    generateWithAIButt: 'button:has-text("Generate with AI")',
    experianceEye: 'body > div:nth-child(1) > div:nth-child(2) > main:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > button:nth-child(3)',
    experianceDelete: 'body > div:nth-child(1) > div:nth-child(2) > main:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > button:nth-child(4)',
    expPosition: ':nth-child(3) > .space-y-2 > .grid > :nth-child(1) > .input-field',
    
    expCompany:':nth-child(3) > .space-y-2 > .grid > :nth-child(2) > .input-field',

expSDate: ':nth-child(3) > .space-y-2 > .grid > :nth-child(3) > .input-field',
expEDate: ':nth-child(3) > .space-y-2 > .grid > :nth-child(4) > .input-field',
expBox: 'textarea[placeholder="Describe your responsibilities and achievements..."]',
addExperiance: 'body > div:nth-child(1) > div:nth-child(2) > main:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2) > div:nth-child(2) > div:nth-child(1) > button:nth-child(3)',
addEdu: 'body > div:nth-child(1) > div:nth-child(2) > main:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(3) > div:nth-child(2) > div:nth-child(1) > button:nth-child(2)',
    psummery: 'div.rounded-lg > div > p',
    deg: 'body > div:nth-child(1) > div:nth-child(2) > main:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(3) > div:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > input:nth-child(2)',
    fieldOfStudy: 'body > div:nth-child(1) > div:nth-child(2) > main:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(3) > div:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > div:nth-child(2) > input:nth-child(2)',
    institution: 'body > div:nth-child(1) > div:nth-child(2) > main:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(3) > div:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > div:nth-child(3) > input:nth-child(2)',
    startEnd: 'body > div:nth-child(1) > div:nth-child(2) > main:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(3) > div:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > div:nth-child(4) > input:nth-child(2)',
   projectTitle: 'body > div:nth-child(1) > div:nth-child(2) > main:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(5) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > input:nth-child(2)',
proDesc: 'textarea[placeholder="Description..."]',
addsection1: ':nth-child(7) > .inline-flex',

    linkinwin: 'p:has-text("linkedin.com/in/johndoe")',
    deleteEducationSection: ':nth-child(2) > main:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(3) > div:nth-child(1) > button:nth-child(4) > svg:nth-child(1) > path:nth-child(2)',
    removeEdu: ':nth-child(3) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > button:nth-child(2)',
    dataTop: 'div.rounded-lg > div > p',
    addItem: 'button:has-text("Add Item")',
    emptyProfession: 'div:has-text("Please enter your profession")',
    previewWindow: 'div.hidden > div.mx-auto > div.rounded-lg',
    addSection: ':nth-child(4) > .border-t > .space-y-3 > .inline-flex',
    sectionsWin: 'div.space-y-4 > div.relative > div.absolute',
    work: 'button:has-text("Work Experience")',
    education: 'button:has-text("Education")',
    skills: 'button:has-text("Skills")',
    projects: 'button:has-text("Projects")',
    certificates: 'button:has-text("Certifications")',
    languages: 'button:has-text("Languages")',
    ref: 'button:has-text("References")',
    customSec: 'button:has-text("Custom Section")',
    downloadConfirmationMsg: '[data-content=""] > div',


    undo: 'button[title="Undo"]',
    familyFontBut: ':nth-child(4) > .flex > .hidden',
    bodyFontDd: 'body > div:nth-child(1) > div:nth-child(2) > main:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2) > div:nth-child(4) > div:nth-child(3) > select:nth-child(2)',
    headingFont: 'body > div:nth-child(1) > div:nth-child(2) > main:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2) > div:nth-child(4) > div:nth-child(3) > select:nth-child(2)'

    
    }


  // ══════════════════════════════════════════════════════════════════════════════
  // SKILLS SECTION - Left Panel
  // ══════════════════════════════════════════════════════════════════════════════

clickFontDD(){

  cy.get(this.weblocators.familyFontBut).click()

}


selectBodyFont(){

  
          //select and store selected value
       cy.selectRandom(this.weblocators.bodyFontDd).as('font').then(selected => {
    cy.log("Selected value for roof pitch:", selected);
});


  
}

getHeadingFont() {

      cy.get(this.weblocators.headingFont ).select('Inter')
     
  

}

selectRandomFont() {



  cy.get(this.weblocators.bodyFontDd).select('Inter')
    .as('selectedFont')  // ← was 'selectFont', must match what test uses
    .then((selected) => {
      cy.log('Selected font:', selected)
    })
}

  // Method to get and store the value

clickEyeExperiance(){

  cy.get(this.weblocators.experianceEye).click()

}

clickDeleteExperiance(){

  cy.get(this.weblocators.experianceDelete).click()

}

clickUndo(){
cy.get(this.weblocators.undo).click()


}
  
  uploadValidImagePng(){

cy.get(this.weblocators.image).selectFile('cypress/fixtures/imgpng.png', { force: true })
  cy.get(this.weblocators.imageDeleteIcon).should('be.visible')
  cy.get(this.weblocators.profileImagePro).should('be.visible')
  cy.wait(200)
}

 uploadValidImageJpg(){

cy.get(this.weblocators.image).selectFile('cypress/fixtures/imgjpg.jpg', { force: true })
  cy.get(this.weblocators.imageDeleteIcon).should('be.visible')
  cy.get(this.weblocators.profileImagePro).should('be.visible')
  cy.wait(200)
}

 uploadInvaidImageFile() {

cy.get(this.weblocators.image).selectFile('cypress/fixtures/jira.csv', { force: true })
  cy.get(this.weblocators.imageDeleteIcon).should('not.exist')
  cy.get(this.weblocators.profileImagePro).should('not.exist')
  cy.wait(200)

cy.get('.file-error-message').should('be.visible')

}

get summaryTextarea() { 
    return cy.get("textarea[placeholder='A brief overview of your professional background...']");
}

// Method to capture and store the existing summary
storeProfessionalSummary() {
    return this.summaryTextarea
        .invoke('val') // Get current text
        .then((text) => {
            cy.wrap(text).as('capturedSummary'); // Store as alias
        });
}


    getInputValue(selector) {
        return selector.invoke('val');
    }

     
 fillFirstName(value) {
    // Typing the value and ensuring it's cleared first
    cy.get(this.weblocators.firstName)
      .clear()
      .type(value)
      .should('have.value', value); // Guardrail to ensure typing finished

    // Wrap the value so we can use it in assertions elsewhere
    cy.wrap(value).as('typedFirstName');
}
 
  fillLastName(value) {
    cy.get(this.weblocators.lastName).clear()
      .type(value)
      .should('have.value', value)
        cy.wrap(value).as('typedLastName');

  }
 
    fillPhone(value) {
    cy.get(this.weblocators.ph).clear().type(value) .should('have.value', value)
    cy.wrap(value).as('typedPH');
  }
 
  fillCity(value) {
    cy.get(this.weblocators.city).clear().type(value).should('have.value', value)
    cy.wrap(value).as('typedCity');
  }
 
  fillCountry(value) {
    cy.get(this.weblocators.country).clear().type(value)
    .should('have.value', value)
     cy.wrap(value).as('typedCountry');
  }
 
  checkHeadline(value) {

  cy.get(this.weblocators.headLine).clear().type(value)
    .should('have.value', value)
     cy.wrap(value).as('typedHL');
  }
 
 
  fillLinkedin(value) {
    cy.get(this.weblocators.linkedIn).clear().type(value)
     .should('have.value', value)
     cy.wrap(value).as('typedLinkedIn');
  }
 
  fillWebsite(value) {
    cy.get(this.weblocators.website).clear().type(value)
    .should('have.value', value)
     cy.wrap(value).as('typedWebsite');
  }

  clickAndAddExp() {
    cy.get(this.weblocators.addExperiance).click()
     
  }

  addExpPosition(value){

    cy.get(this.weblocators.expPosition).clear().type(value)
     .should('have.value', value)
     cy.wrap(value).as('position');
  }
 

  enterExpCompany(value){

    cy.get(this.weblocators.expCompany).clear().type(value)
     .should('have.value', value)
     cy.wrap(value).as('company');
  }

    selectSDate(value){

    cy.get(this.weblocators.expSDate).clear().type(value)
     .should('have.value', value)
     cy.wrap(value).as('sdate');
  }

    selectEDate(value){

    cy.get(this.weblocators.expEDate).clear().type(value)
     .should('have.value', value)
     cy.wrap(value).as('edate');
  }

  
    enterJobDescription(value){

    cy.get(this.weblocators.expBox).eq(2).clear().type(value)
  //  cy.get('textarea[placeholder="Describe your responsibilities and achievements..."]').eq(0)
     .should('have.value', value)
     cy.wrap(value).as('jobdescription');
  }


  //start ading education section

  clickAddEduButton(){

    cy.get(this.weblocators.addEdu).click()
  }

  enterDeg(value){

    cy.get(this.weblocators.deg).clear().type(value)
    .should('have.value', value)
     cy.wrap(value).as('deg');

  }

   enterFieldOFStudy(value){

    cy.get(this.weblocators.fieldOfStudy).clear().type(value)
    .should('have.value', value)
     cy.wrap(value).as('FOS');

  }

     enterInstitution(value){

    cy.get(this.weblocators.institution).clear().type(value)
    .should('have.value', value)
     cy.wrap(value).as('institution');

  }

      enterStartEnd(value){

    cy.get(this.weblocators.startEnd).clear().type(value)
    .should('have.value', value)
     cy.wrap(value).as('startEnd');

  }


  addSkill(){

    cy.get(this.weblocators.addSection).click()

  }

   enterSkillName(value){

    cy.get(this.weblocators.skillName).clear().type(value)
    .should('have.value', value)
     cy.wrap(value).as('skillName');

       }

    selectSkillLevel(){
      
      cy.get((this.weblocators.skillLevelDropdown)).then(($select) => {
  const options = $select.find('option');
  const randomIndex = Math.floor(Math.random() * options.length);

  const value = options[randomIndex].value;

  cy.wrap($select).select(value);
    cy.wrap(value).as('skillLevel');
});
    }

clickAddSecBut(){

  cy.get(this.weblocators.addsection1).click()
}


selectingProjectSection(){

  cy.get('.absolute > .grid > :nth-child(4)').click()
  
}
clickAddItemProjectButt(){

  cy.get('body > div:nth-child(1) > div:nth-child(2) > main:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(5) > div:nth-child(2) > div:nth-child(1) > button:nth-child(1)').click()
}

enterProjectTitle(value){

  cy.get(this.weblocators.projectTitle).clear().type(value)
 .should('have.value', value)
     cy.wrap(value).as('proTitle');
}

enterDescription(value){

  cy.get(this.weblocators.proDesc).clear().type(value)
  .should('have.value', value)
     cy.wrap(value).as('proDesc');
}


addCertificationSection(){

  cy.get('.absolute > .grid > :nth-child(5)').click()
}

enterCertificationTitle(){

  cy.get('body > div:nth-child(1) > div:nth-child(2) > main:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(6) > div:nth-child(2) > div:nth-child(1) > button:nth-child(1)').click()
  cy.get('body > div:nth-child(1) > div:nth-child(2) > main:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(6) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > input:nth-child(2)').clear().type(' DIT')
  cy.get('body > div:nth-child(1) > div:nth-child(2) > main:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(6) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > textarea:nth-child(2)').clear().type('AI Related')
  
}
addRefSection(){
  cy.get(':nth-child(10) > .inline-flex').click() //clcik Add section button
 cy.get('.absolute > .grid > :nth-child(7)').click() //select language
  cy.get(':nth-child(8) > .border-t > .space-y-3 > .inline-flex').click() //click add item
  cy.get('body > div:nth-child(1) > div:nth-child(2) > main:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(8) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > input:nth-child(2)').clear().type('IT dep')
  cy.get('body > div:nth-child(1) > div:nth-child(2) > main:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(8) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > input:nth-child(2)').clear().type('Referance from last office')
  
  }


addCustomSection(){

  cy.get(':nth-child(11) > .inline-flex').click()
  cy.get('.absolute > .grid > :nth-child(8)').click()
  cy.get(':nth-child(9) > .border-t > .space-y-3 > .inline-flex').click()
  cy.get('body > div:nth-child(1) > div:nth-child(2) > main:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(9) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > input:nth-child(2)').clear().type('Details')
  cy.get('body > div:nth-child(1) > div:nth-child(2) > main:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(9) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > textarea:nth-child(2)').clear().type('This is details')

}


addLanguageSection(){

  cy.get('.space-y-4 > :nth-child(9) > .inline-flex').click()
  cy.get('.absolute > .grid > :nth-child(6)').click()
  cy.get(':nth-child(7) > .border-t > .space-y-3 > .inline-flex').click()
  cy.get('body > div:nth-child(1) > div:nth-child(2) > main:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(7) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > input:nth-child(2)').clear().type('JS')
  cy.get('body > div:nth-child(1) > div:nth-child(2) > main:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(7) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > textarea:nth-child(2)').clear().type('This is Java script language')
  
}




  selectProjectSection(){

    cy.get('.absolute > .grid > :nth-child(4)').click()
  }

  addItemsInProjectsSection(){

    cy.get('button:has-text("Add Item")').clicl()
  }




   previewContains(text) {
    cy.get(this.weblocators.previewWindow).should('contain.text', text)
    .should('have.value', value)
     cy.wrap(value).as('typedContains');
  }
 
 removeSkill(){

  cy.get(':nth-child(4) > .border-t > .space-y-3 > :nth-child(1) > .mt-2').click()

 }

  clickRemoveLink(){

    cy.contains('Remove').click()
    cy.get(this.weblocators.imageDeleteIcon).should('not.exist')
  cy.get(this.weblocators.profileImagePro).should('not.exist')

  }

clickExpertButton(){

  cy.contains('Export').click()
}

clickExportPDF(){

  cy.contains('Export as PDF').click()
  cy.wait(200)
  //cy.get(this.weblocators.downloadConfirmationMsg).should('be.visible')

}

varifyMsg(){

  cy.get(this.weblocators.downloadConfirmationMsg).should('have.text', 'CV exported as PDF');
}

verifyRegistrationData(value){

  cy.get(this.weblocators.email)
  .invoke('val')
  .then((value1) => {
    expect(value1).to.equal(value);
  });


}

varifyMsgDOX(){

  cy.get(this.weblocators.downloadConfirmationMsg).should('have.text', 'CV exported as DOCX');
}
clickexportdoc(){

  cy.contains('Export as DOCX').click()
}
  
clickAIAssist(){

  cy.contains('AI Assist').should('not.exist')
}

validateTitleAIWin(){

  cy.contains('AI Summary Generator').should('be.visible')
}




  // All skill rows (each row = one skill entry)
  skillRows() {
    return cy.get('.rounded-lg.border.border-stone-100');
  }

  // Skill name input inside a specific row (by index, 0-based)
  skillNameInput(index) {
    return this.skillRows().eq(index).find('input.input-field');
  }

  // Skill level dropdown inside a specific row (by index)
  skillLevelDropdown(index) {
    return this.skillRows().eq(index).find('select.input-field');
  }


  // "Add Item" button at the bottom of skills
  addItemButton() {
    return cy.contains('button', 'Add Item');
  }

  // "Add Section" button at the very bottom
  addSectionButton() {
    return cy.contains('button', 'Add Section');
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // TOOLBAR - Top Bar
  // ══════════════════════════════════════════════════════════════════════════════

  exportButton()      { return cy.contains('button', 'Export'); }
  aiAssistButton()    { return cy.contains('button', 'AI Assist'); }
  fontFamilyButton()  { return cy.contains('button', 'Font Family'); }
  undoButton()        { return cy.get('button').eq(0); } // First toolbar button

  // ══════════════════════════════════════════════════════════════════════════════
  // EXPORT DROPDOWN
  // ══════════════════════════════════════════════════════════════════════════════

  exportAsPDFOption()  { return cy.contains('Export as PDF'); }
  exportAsDOCXOption() { return cy.contains('Export as DOCX'); }

  // ══════════════════════════════════════════════════════════════════════════════
  // FONT FAMILY PANEL
  // ══════════════════════════════════════════════════════════════════════════════

  bodyFontDropdown()    { return cy.get('select').filter(':visible').eq(0); }
  headingFontDropdown() { return cy.get('select').filter(':visible').eq(1); }
  fontSizeSmall()       { return cy.contains('button', 'Small'); }
  fontSizeMedium()      { return cy.contains('button', 'Medium'); }
  fontSizeLarge()       { return cy.contains('button', 'Large'); }
  fontPreviewHeading()  { return cy.contains('Heading Preview'); }
  // Skill name input inside a row
  skillNameInput(index) {
    return this.skillRows().eq(index).find('input.input-field');
  }




  // PREVIEW PANEL skill tags (right window)
  previewSkillTags() {
    return cy.get('span[style*="inline-block"]');
  }

  // A single preview tag by skill name
  previewSkillTag(skillName) {
    return cy.get('span[style*="inline-block"]').contains(skillName);
  }
// ══════════════════════════════════════════════════════════════════════════
  // CORE ACTION: Extract ALL skill names from inputs and save to alias
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Reads every skill input field value and saves as @inputSkills
   * Usage in test: cy.get('@inputSkills').then((skills) => { ... })
   */
  extractAllInputSkills() {
    const skills = [];

    this.allSkillInputs().each(($input) => {
      const val = $input.val().trim();
      if (val) skills.push(val);
    }).then(() => {
      cy.wrap(skills).as('inputSkills');
      cy.log(`📋 Extracted ${skills.length} skills from input fields:`);
      skills.forEach((s, i) => cy.log(`  [${i}] ${s}`));
    });
  }

  /**
   * Reads every preview tag text and saves as @previewSkills
   */
  extractAllPreviewSkills() {
    const skills = [];

    this.previewSkillTags().each(($tag) => {
      const val = $tag.text().trim();
      if (val) skills.push(val);
    }).then(() => {
      cy.wrap(skills).as('previewSkills');
      cy.log(`👁️ Extracted ${skills.length} skills from preview panel:`);
      skills.forEach((s, i) => cy.log(`  [${i}] ${s}`));
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ASSERTIONS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Check every input skill appears in preview (one by one)
   */
  verifyEachInputSkillAppearsInPreview() {
    this.allSkillInputs().each(($input) => {
      const skillName = $input.val().trim();
      if (skillName) {
        cy.log(`🔍 Checking "${skillName}" in preview...`);
        this.previewSkillTag(skillName).should('exist');
      }
    });
  }

  /**
   * Check for DUPLICATE skill names in input fields
   * Saves duplicates as @duplicateSkills
   */
  findDuplicateInputSkills() {
    this.allSkillInputs().then(($inputs) => {
      const values = [];
      $inputs.each((i, el) => {
        const val = Cypress.$(el).val().trim();
        if (val) values.push(val);
      });

      const duplicates = values.filter(
        (val, idx) => values.indexOf(val) !== idx
      );
      const uniqueDuplicates = [...new Set(duplicates)];

      cy.wrap(uniqueDuplicates).as('duplicateSkills');

      if (uniqueDuplicates.length > 0) {
        cy.log(`⚠️ DUPLICATES FOUND: ${uniqueDuplicates.join(', ')}`);
      } else {
        cy.log('✅ No duplicate skills found');
      }
    });
  }

  /**
   * Check count of inputs matches count of preview tags
   */
  verifyInputCountMatchesPreview() {
    let inputCount = 0;
    let previewCount = 0;

    this.allSkillInputs().then(($inputs) => {
      $inputs.each((i, el) => {
        if (Cypress.$(el).val().trim()) inputCount++;
      });

      this.previewSkillTags().then(($tags) => {
        previewCount = $tags.length;

        cy.log(`📊 Input count: ${inputCount} | Preview count: ${previewCount}`);
        expect(inputCount).to.equal(
          previewCount,
          `Input fields (${inputCount}) should match preview tags (${previewCount})`
        );
      });
    });
  }

  /**
   * Check NO skill appears more than once in preview
   */
  verifyNoDuplicatesInPreview() {
    this.previewSkillTags().then(($tags) => {
      const names = [];
      $tags.each((i, el) => names.push(Cypress.$(el).text().trim()));

      const duplicates = names.filter((v, i) => names.indexOf(v) !== i);
      const unique = [...new Set(duplicates)];

      cy.log(`👁️ Preview skills: ${names.join(', ')}`);

      if (unique.length > 0) {
        cy.log(`⚠️ Preview duplicates: ${unique.join(', ')}`);
      }

      expect(unique.length).to.equal(0, `No duplicate skills in preview. Found: ${unique.join(', ')}`);
    });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // ACTIONS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * Add a new skill by clicking Add Item and filling the last row
   */
  addNewSkill(skillName, level = 'intermediate') {
    this.addItemButton().click();
    // The new row appears at the end — get the last row
    this.skillRows().last().find('input.input-field').clear().type(skillName);
    this.skillRows().last().find('select.input-field').select(level);
  }

  /**
   * Update an existing skill name by index
   */
  updateSkillName(index, newName) {
    this.skillNameInput(index).clear().type(newName);
  }

  /**
   * Change skill level for a row by index
   */
  updateSkillLevel(index, level) {
    // level: 'beginner' | 'intermediate' | 'advanced' | 'expert'
    this.skillLevelDropdown(index).select(level);
  }

  
  /**
   * Open Export dropdown and click PDF
   */
  exportAsPDF() {
    this.exportButton().click();
    this.exportAsPDFOption().click();
  }

  /**
   * Open Export dropdown and click DOCX
   */
  exportAsDOCX() {
    this.exportButton().click();
    this.exportAsDOCXOption().click();
  }

  /**
   * Open Font Family panel
   */
  openFontFamily() {
    this.fontFamilyButton().click();
  }

  /**
   * Open AI Assist modal
   */
  openAIAssist() {
    this.aiAssistButton().click();
  }

  /**
   * Fill and submit AI Summary Generator
   */
  fillAIModal({ profession, level, keySkills, careerGoal }) {
    if (profession) this.professionInput().clear().type(profession);
    if (level)      this.experienceLevelDropdown().select(level);
    if (keySkills)  this.keySkillsInput().clear().type(keySkills);
    if (careerGoal) this.careerGoalTextarea().clear().type(careerGoal);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // ASSERTIONS
  // ══════════════════════════════════════════════════════════════════════════════

  verifySkillCountIs(count) {
    this.skillRows().should('have.length', count);
  }

  verifySkillNameIs(index, expectedName) {
    this.skillNameInput(index).should('have.value', expectedName);
  }

  verifySkillLevelIs(index, expectedLevel) {
    this.skillLevelDropdown(index).should('have.value', expectedLevel);
  }

  verifySkillInPreview(skillName) {
    this.previewSkillTag(skillName).should('be.visible');
  }

  verifySkillNotInPreview(skillName) {
    this.previewSkillTag(skillName).should('not.exist');
  }

 

}





export default new SkillsPage();