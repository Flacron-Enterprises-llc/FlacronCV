class coverLetterEditPage {

  // Locators
  nameField = 'input[placeholder="Your name"]';
  emailField = 'input[type="email"]';
  editor = '.ProseMirror';
  previewCompanyName = '#cl-preview-content div[style*="color: rgb(85, 85, 85)"]';
  positinOnPreviewWin = ':nth-child(1) > div:nth-child(2) > main:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2) > div:nth-child(2)'
  previewPositionContainer = '#cl-preview-content div[style*="border-left"]';
  previewName = ':nth-child(1) > div:nth-child(2) > main:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1)';
  previewEmail = 'nth-child(2) > main:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2)';
  previewContent = '[style="padding: 40px 48px;"]';
  previewPosition = '#cl-preview-content span';
  previewRecipientName = '#cl-preview-content div[style*="font-weight: 600"]';
   textArea = '#cl-preview-content'
  saveButton = 'button:contains("Save")';
  savedText = 'span:contains("Saved at")';
  confirmationMSG= 'ol[dir="ltr"] li div div'



  // Actions

  enterTextinTextarea(value){
     cy.get('div.flex-1 > div > div.tiptap').type(value)


  }

  clickExportButton(){

    cy.contains('Export').click()
  }

  selectPDFExport(){

    cy.contains('Export as PDF').click()
  }


  selectDocExport(){

    cy.contains('Export as DOCX').click()
  }

  confirmationMSGforPDF(){

    cy.contains('Exported as PDF').should('be.visible')

  }

  confirmationMsgForDocx(){
     cy.contains('Exported as DOCX').should('be.visible')


  }

  clickAIimproveButton(){

    cy.contains('AI Improve').click()
  }

  AIimproveMsg(){

    cy.get(this.confirmationMSG).should('have.text','Cover letter improved with AI')
  }

  validateEmptyPreviewMessage() {
  cy.contains('#cl-preview-content', 'Your letter content will appear here…')
    .should('be.visible');
}

validateEditorIsEmpty() {
  cy.get(this.textArea)
    .invoke('text')
    .then((text) => {
      expect(text.trim()).to.equal('');
    });
}
  enterName(value) {
    cy.get(this.nameField).clear().type(value);
      cy.wrap(value).as('name');
      cy.log('@name')
  }

  enterEmail(value) {
    cy.get(this.emailField).clear().type(value);
      cy.wrap(value).as('email');
  }

  typeContent(text) {
    cy.get(this.editor).clear().type(text);
    cy.wrap(value).as('content');
    

  }


 validatePosition(expectedValue) {

     cy.get('@jobTitle').then((expectedValue) => {
    cy.get('#cl-preview-content')
    .should('contain.text', `Position: ${expectedValue}`);
})
}

  clickSave() {
    cy.contains('button', 'Save').click({ force: true });
  }

  // Validations
  validatePreviewName(expectedValue) {

   cy.get('@name').then((expectedValue) => {

    cy.get(this.previewName).invoke('text').then(console.log);
  cy.get(this.previewName)
    .invoke('text')
    .then((text) => {
      expect(text.trim()).to.eq(expectedValue);
    });
});

  }

  validatePreviewEmail(expectedValue) {
    
   cy.get('@email').then((expectedValue) => {

    cy.get(this.previewName).invoke('text').then(console.log);
   cy.get('[style="opacity: 0.85; font-size: 0.9em; margin-top: 4px;"]')
    .invoke('text')
    .then((text) => {
      expect(text.trim()).to.eq(expectedValue);
    });
});

    
  }
validateTextAreaWithPreview() {
    // 1. Get the text from the editor
    cy.get('div.flex-1 > div > div.tiptap')
        .invoke('text')
        .then((editorText) => {
            const trimmedText = editorText.trim();
            
            // 2. SAVE into a Cypress variable (Alias)
            cy.wrap(trimmedText).as('editorContent');
            
            // 3. Continue with your validation logic
            cy.get('[style="margin-bottom: 32px;"]')
                .should('have.length.at.least', 1)
                .then(($els) => {
                    const combinedText = [...$els]
                        .map(el => el.innerText.trim())
                        .join(' ');

                    expect(combinedText).to.include(trimmedText);
                });
        });
}


validatePreviewContent(text) {
    cy.get(this.previewContent).should('contain', text);
  }

  validateCurrentDate() {
  const today = new Date();

  const formattedDate = today.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  cy.contains('#cl-preview-content div', formattedDate)
    .should('be.visible');
}

 validateRecipientName(expectedValue) {

 cy.get('@RName').then((expectedValue) => {
  cy.get('#cl-preview-content')
    .find('div[style*="font-weight: 600"]')
    .first()
    .should('be.visible')
    .and('have.text', expectedValue);
});
}

   //  cy.get(this.previewPosition).should('contain', rec);

  

 validateCompanyName(expectedValue) {
  cy.get('@CName').then((expectedValue) => {
    cy.get(this.previewCompanyName)
      .first()
      .should('be.visible')
      .and('contain.text', expectedValue);
  });
}
  validateSaved() {
    cy.get(this.savedText).should('be.visible');
  }
}

export default coverLetterEditPage