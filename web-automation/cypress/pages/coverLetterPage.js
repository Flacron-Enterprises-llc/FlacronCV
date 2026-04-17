class CoverLetterPage {
    // Locators based on your HTML
    weblocators = {
        titleInput: '#title',
        recipientInput: '#recipientName',
        companyInput:'#companyName',
        jobTitleInput:'#jobTitle',
        jobDescTextArea: '#jobDescription',
        cvLinkSelect: '#linkedCVId',
        companyName: '[placeholder="e.g. Google"]',
        msg: 'ol[dir="ltr"] li div div',
        recipientName: '#recipientName',
        jobTitle: '#jobTitle',
        cvDropdown: '#linkedCVId',
        jobDescription: '#jobDescription',
        aiGenerate: ':nth-child(3) > .justify-between > .flex',
        dropdownOptions : 'option, [role="option"]',
         cvLinkSelect: '#linkedCVId',
        dropdownOptions: 'option, [role="option"]'

     
    }



    // Action Methods

   // Fix: Added return so you can chain .contains() in the test
    cvLinkSelect() {
        return cy.get(this.weblocators.cvLinkSelect);
    }

    openDropdown() {
        return cy.get(this.weblocators.cvLinkSelect).click();
    }
    
validateCVsInDropdown() {
  cy.get('@cvTitlesList').then((cvTitles) => {

    // If custom dropdown → open it
    cy.get(this.weblocators.cvDropdown).then(($el) => {
      if (!$el.is('select')) {
        cy.wrap($el).click();
      }
    });


    // Get all dropdown options
    cy.get(this.weblocators.dropdownOptions)
      .should('be.visible')
      .then(($options) => {

        const optionTexts = [...$options].map(el => el.innerText.trim());

        // Validate each CV title exists
        cvTitles.forEach((title) => {
          expect(optionTexts).to.include(title);
        });

      });

  });
}

    confirmationMsgForGenerateCL(){

        cy.wait(500)
        cy.get(this.weblocators.msg).should('have.text','Cover letter created successfully')

      //  cy.get('div:has-text("Cover letter created successfully")').should('be.visible')
    }

    confirmationMsgForAIGenerateJobDescription(){

        cy.get(this.weblocators.msg).should('have.text','Job description generated successfully')

      //  cy.get('div:has-text("Job description generated successfully")').should('be.visible')
    }

    enterRecipintName(value){

        cy.get(this.weblocators.recipientName).clear()
      .type(value)
      .should('have.value', value);

       cy.wrap(value).as('RName');
    }

    enterJobTitle(value){

        cy.get(this.weblocators.jobTitle)
         .clear()
      .type(value)
      .should('have.value', value);
       cy.wrap(value).as('jobTitle');
    }

  getJobDescription() {

    return this.jobDescriptionTextarea
        .invoke('val') // Get current text
        .then((text) => {
            cy.wrap(text).as('jobDescription'); // Store as alias
        });
}

get jobDescriptionTextarea() { 
    return cy.get(this.weblocators.jobDescTextArea);
}


    clickAIGenerateBut(){

        cy.get(this.weblocators.aiGenerate).click()
    }

    selectCV(){


        cy.selectRandomOption(this.weblocators.cvDropdown)
    
  
    }


    clickAIGenerate(){

        cy.contains('AI Generate').click()
    }

    alertMsg(){

        cy.get(this.weblocators.msg).should('have.text','Title is required')
    }

    visitNewCoverLetterPage(){

        cy.visit('cover-letters/new')


    }

    enterCompanyName(value){

        cy.get('[placeholder="e.g. Google"]')
         .clear()
      .type(value)
      .should('have.value', value);
       cy.wrap(value).as('CName');
    }

    enterTitle(value){

        cy.get(this.weblocators.titleInput)
         .clear()
      .type(value)
      .should('have.value', value);
       cy.wrap(value).as('title');
    }

    clickCancelbutton(){

        cy.contains('Cancel').click()
    
    }

    clickCreateBlank(){

        cy.contains('Create Blank').click()
    }

    erroAIgeneratedButt(){

        cy.contains('Company name and job title are required for AI generation').should('be.visible')
    }

    clickGenerateWithAI(){

        cy.contains('Generate with AI').click()
    }

    createBlankMsg(){

        cy.contains('Cover letter created successfully').should('be.visible')
    }




    submitWithAI() {
        cy.get(this.elements.generateWithAiBtn).click();
    }
}

export default  CoverLetterPage