class signUp {


    //Locators

    weblocators={

        getFreeStartedButt: '//a[@class="btn btn-primary"][normalize-space()="Get Started Free"]',
        fullName :'#fullName',
        email :'#email',
        password:'#password',
        conPassword:'#confirmPassword',
        wrongPw: 'body > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > form:nth-child(3) > div:nth-child(3) > span:nth-child(4)',
        Checkbox: 'input[type="checkbox"]',
        secPageTitle: '.preferences-title',
        language: 'button[class="language-button selected"] div[class="language-native"]',
        targetCountry: 'button[class=:country-button selected"]',
         countryButtons: '.country-button',
        name: '',
         countryNames: '.country-name',

        continueDashboardButt: '.continue-button',
        skip: 'div[class="skip-button"] button',
        dashboard: 'div[class="dashboard-welcome"] span:nth-child(1)',
        createAccoutnButt :'.button[type="submit"]',
        strengthLabel: 'div:contains("Weak")',
        rule8Characters: 'li:contains("At least 8 characters")',
        ruleUpperLower: 'li:contains("Uppercase & lowercase")',
        ruleNumber: 'li:contains("At least one number")',
        eyeIcon: '[data-testid="toggle-password"]',
        googleSignUp: 'button.login-google-btn',
        signIn: 'a[href="/login"]',
        terms: 'a[href="/terms"]',
        privacy: 'a[href="/privacy"]',
        title : 'div[class="card"] div h1',
        invalidPwError : ".text-red-500.text-sm.text-center",
        changeasswordError : "body > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > form:nth-child(3) > div:nth-child(4) > span:nth-child(3)",
        EmptyFieldsMsg : '.text-center.text-red-500.text-xs.font-medium.mb-2',
        errorOnNotCheckTermBox: 'body > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > form:nth-child(3) > div:nth-child(5) > label:nth-child(1)'
    }


  //Methords

  validateCreateAccountButtonOnEmptyFields(){

   cy.get(this.weblocators.fullName)
    .invoke('prop', 'validationMessage')
    .should('contain', 'Please fill out this field'); // Or custom HTML5 message

   //.should('be.disabled')
    

  }
  
     enterFullName(FName){
        cy.get(this.weblocators.fullName).clear().type(FName)
                
    }

    validateWithGoogleButt(){
     //   cy.get(this.weblocators.googleSignUp).click()
     cy.window().then((win) => {
cy.stub(win,'open').as('popup')
})

     cy.get('[style="display: flex; align-items: center; justify-content: center; gap: 0.75rem; padding: 0.875rem; border: 2px solid var(--gray-300); border-radius: var(--radius-md); background: white; font-size: 1rem; font-weight: 500; transition: 0.2s; cursor: pointer;"]').click()

cy.get('@popup')
.should('be.called')
    }

     saveEnteredName() {
    return this.elements.FName().invoke('val');
  }

    validatePageTitle(){

        cy.get(this.weblocators.title).should('have.text', 'Create Your Account');

    }

    enterEmail(){

         const email = `testuser_${Date.now()}@example.com`;

        cy.get(this.weblocators.email).clear().type(email)
    }


    validateTermLink() {

  cy.get(this.weblocators.terms)
    .should('be.visible')
    .invoke('removeAttr', 'target')   // Open in same tab
    .click()

  cy.url({ timeout: 10000 })
    .should('include', '/terms')

  cy.verifyPageIsNotBlank()

}
    
      validatePrivacylink(){

        cy.get(this.weblocators.privacy)
         .should('be.visible')
    .invoke('removeAttr', 'target')   // Open in same tab
    .click()
    
  cy.url({ timeout: 10000 })
   .should('include', '/privacy')

  cy.verifyPageIsNotBlank()


    }


enterDuplicateEmail(email){
cy.get(this.weblocators.email).clear().type(email)

     
}

     validateErrorOnDuplicateEmail(){

      cy.contains('This email is already registered. Please login instead.').should('be.visible')
    }

 

       saveEnteredEmail() {
    return this.elements.email().invoke('val');
  }
    enterPassword(Password){

        cy.get(this.weblocators.password, { timeout: 20000 }).clear().type(Password)
        cy.get(this.weblocators.conPassword, { timeout: 20000 }).type(Password)
        cy.contains('✓ Passwords match');
    }

    
    clickButton(){

       cy.contains('Create Account').click()
    }

    validateWeakPassword() {

    cy.contains('Weak')
      .should('be.visible')

    cy.contains('At least 8 characters')
      .should('contain','✓')

    cy.contains('Uppercase & lowercase')
      .should('contain','○')

    cy.contains('At least one number')
      .should('contain','○')


  }

  validatePW(){

    cy.contains('✓ At least 8 characters').should('be.visible')
    cy.contains('✓ Uppercase & lowercase').should('be.visible')
    cy.contains('✓ At least one number').should('be.visible')
  }


  clickEyeIcon() {

    cy.get(this.weblocators.eyeIcon)
      .click()

  }


    validateErrornUncheckTermBox() {

   cy.contains('You must accept the terms and conditions').should('be.visible')
    

  }


    validateEmailField(email){
        cy.get(this.weblocators.email, { timeout: 20000 }).scrollIntoView()
  .should('be.visible')
.type(email)
        cy.get(this.weblocators.email, { timeout: 20000 }) .scrollIntoView()
  .should('be.visible')
.then(($input) => {
    expect($input[0].validationMessage, { timeout: 20000 }).to.contain('@')
  })
                
    }

       validateSigninLink(){

        cy.get(this.weblocators.signIn).click()
        cy.url().should('eq', 'https://flacroncv.onrender.com/login');

 
                
    }


    ValidateInvalidPasswordLenght(Password){

        cy.get(this.weblocators.password, { timeout: 20000 }).type(Password)
        cy.get(this.weblocators.conPassword, { timeout: 20000 }).type(Password)
        cy.wait(300)
        cy.get(this.weblocators.createAccoutnButt,{ timeout: 20000 }).click()
        cy.wait(300)
        cy.get(this.weblocators.invalidPwError,{ timeout: 20000 })   // change selector as per UI
       .should('be.visible')
       .and('contain', 'Password must contain uppercase, lowercase, and number')

       
    }


     ValidatePasswordandConfirmPasswordChange(Password){

        cy.get(this.weblocators.password).type(Password)
         
        cy.get(this.weblocators.conPassword).type("123456")
        cy.wait(300)
         cy.get(this.weblocators.Checkbox).click()
         cy.wait(200)
      cy.contains('Create Account').click()
       cy.wait(300)

         cy.get(this.weblocators.changeasswordError)
      .should('be.visible')
      .and('contain', 'Passwords do not match')
       
    }


    validateDashboard(name){
        
        cy.get(this.weblocators.dashboard).should('be.visible')
       // cy.get()
    }


    selectCountyandLangauge(){

        cy.get(this.weblocators.continueDashboardButt).click()

        
    }

    validatePage2(){

        cy.get(this.weblocators.secPageTitle).should('have.text', 'Personalize Your Experience')
    }



    validateSkip(){

        cy.get(this.weblocators.skip).click()

    }

    clickCheckbox(){

        cy.get(this.weblocators.Checkbox).click()
    }
    
    selectRandomCountry(){

cy.get('.country-button')
.then(($countries)=>{

const randomIndex =
Math.floor(Math.random()*$countries.length)

const countryName =
Cypress.$($countries[randomIndex])
.find('.country-name')
.text()
.trim()

cy.wrap(countryName).as('selectedCountry')

cy.wrap($countries[randomIndex])
.click()

})

}


validateSelectedCountry(){

cy.get('@selectedCountry')
.then((country)=>{

cy.get('.country-button.selected')
.find('.country-name')
.should('have.text', country)

})

}

}
export default signUp;