class settings{

    weblocators = {

        imageUpload: 'button[type="button"]',
        email: 'h2[class="text-lg font-semibold text-stone-900 dark:text-white"]',
        fname: '#firstName',
        lname: '#lastName',
        headLine: '#headline',
        bio: '#bio',
        location: '#location',
        linkedIn: '#linkedin',
        gitHub: '#github',
          
    
  }

  //actions

  clickSaveButton(){
    cy.contains('Save Profile').click()
  }

  enterFName(value){

    cy.get(this.weblocators.fname).clear().type(value)
    cy.wrap(value).as('fname');
  }

  enterLName(value){

    cy.get(this.weblocators.lname).clear().type(value)
     cy.wrap(value).as('lname');
    
  }

  enterHeadLine(value){

    cy.get(this.weblocators.headLine).clear().type(value)
     cy.wrap(value).as('hl');
  }


  validateEmail(value){
    
  cy.get(this.weblocators.email).should('have.text',value)

  }
  
  validateFirstName() {


   cy.get('@fname').then((expectedValue) => {

     cy.get(this.weblocators.fname).invoke('val')
  .then((value1) => {
    expect(value1).to.equal(expectedValue);
  });
        });
    
  
}

validateLastName() {

   cy.get('@lname').then((expectedValue) => {

     cy.get(this.weblocators.lname).invoke('val')
  .then((value1) => {
    expect(value1).to.equal(expectedValue);
  });
        });
 
}

validateHL() {

    
   cy.get('@hl').then((expectedValue) => {

     cy.get(this.weblocators.headLine).invoke('val')
  .then((value1) => {
    expect(value1).to.equal(expectedValue);
  });
        });
 

}

validateBio() {

    
   cy.get('@bio').then((expectedValue) => {

     cy.get(this.weblocators.bio).invoke('val')
  .then((value1) => {
    expect(value1).to.equal(expectedValue);
  });
        });
 
}

validateLocation() {
    
   cy.get('@location').then((expectedValue) => {

     cy.get(this.weblocators.location).invoke('val')
  .then((value1) => {
    expect(value1).to.equal(expectedValue);
  });
        });
 

}

validateLinkedIn() {
    
   cy.get('@linkedin').then((expectedValue) => {

     cy.get(this.weblocators.linkedIn).invoke('val')
  .then((value1) => {
    expect(value1).to.equal(expectedValue);
  });
        });
 


}

validateGithub() {

    
   cy.get('@github').then((expectedValue) => {

     cy.get(this.weblocators.gitHub).invoke('val')
  .then((value1) => {
    expect(value1).to.equal(expectedValue);
  });
        });
 
}
  
confirmationMSG()
{
cy.contains('Profile saved successfully').should('be.visible')
}
enterBio(value) {
    cy.get(this.weblocators.bio).clear().type(value);
    cy.wrap(value).as('bio');

}
  enterLocation(value){

    cy.get('[placeholder="e.g. New York, USA"]').clear().type(value)
     cy.wrap(value).as('location');
  }

  enterLinkedIn(value){

     cy.get(this.weblocators.linkedIn).clear().type(value)
     cy.wrap(value).as('linkedin');
  }

  enterGithub(value){

     cy.get(this.weblocators.gitHub).clear().type(value)
     cy.wrap(value).as('github');
  }
  
  uploadValidImagePng(){

cy.get(this.weblocators.imageUpload).selectFile('cypress/fixtures/imgpng.png', { force: true })
  cy.get(this.weblocators.imageDeleteIcon).should('be.visible')
  cy.get(this.weblocators.profileImagePro).should('be.visible')
  cy.wait(200)
}

 uploadValidImageJpg(){

cy.get(this.weblocators.imageUpload).selectFile('cypress/fixtures/imgjpg.jpg', { force: true })
  cy.get(this.weblocators.imageDeleteIcon).should('be.visible')
  cy.get(this.weblocators.profileImagePro).should('be.visible')
  cy.wait(200)
}

 uploadInvaidImageFile() {

cy.get(this.weblocators.imageUpload).selectFile('cypress/fixtures/jira.csv', { force: true })
  cy.get(this.weblocators.imageDeleteIcon).should('not.exist')
  cy.get(this.weblocators.profileImagePro).should('not.exist')
  cy.wait(200)

cy.get('.file-error-message').should('be.visible')

}

  
  visitPage() {
    cy.visit('/settings'); // update URL if needed
  }

  validatePageTitle(){

    cy.contains('Settings').should('be.visible')
  }



}

export default settings