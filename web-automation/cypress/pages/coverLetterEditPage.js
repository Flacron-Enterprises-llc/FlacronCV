class coverLetterEditPage {

  // Locators
  nameField = 'input[placeholder="Your name"]';
  emailField = 'input[type="email"]';
  editor = '.ProseMirror';
  previewCompanyName = '#cl-preview-content div[style*="color: rgb(85, 85, 85)"]';
  positinOnPreviewWin = ':nth-child(1) > div:nth-child(2) > main:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2) > div:nth-child(2)'
  previewPositionContainer = '#cl-preview-content div[style*="border-left"]';
  previewName = '#cl-preview-content div[style*="font-weight: 800"]';
  previewEmail = '#cl-preview-content div[style*="opacity"]';
  previewContent = '[style="padding: 40px 48px;"]';
  previewPosition = '#cl-preview-content span';
  previewRecipientName = '#cl-preview-content div[style*="font-weight: 600"]';
   textArea = 'div.flex-1 > div > div.tiptap'
  saveButton = 'button:contains("Save")';
  savedText = 'span:contains("Saved at")';

  // Actions

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
  enterName(name) {
    cy.get(this.nameField).clear().type(name);
  }

  enterEmail(email) {
    cy.get(this.emailField).clear().type(email);
  }

  typeContent(text) {
    cy.get(this.editor).clear().type(text);
  }

  clickSave() {
    cy.contains('button', 'Save').click({ force: true });
  }

  // Validations
  validatePreviewName(name) {
    cy.get(this.previewName).should('contain', name);
  }

  validatePreviewEmail(email) {
    cy.get(this.previewEmail).should('contain', email);
  }

  validatePreviewContent(text) {
    cy.get(this.previewContent).should('contain', text);
  }


 validatePosition(expectedValue) {

     cy.get('@jobTitle').then((expectedValue) => {
    cy.get('#cl-preview-content')
    .should('contain.text', `Position: ${expectedValue}`);
})
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