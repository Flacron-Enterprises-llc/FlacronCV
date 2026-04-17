class signUpPaid {


    //Locators

    weblocators={

        getFreeTrialButt: 'div[class="hero-actions"] a[class="btn btn-primary btn-lg"]',
        fullName :'input[placeholder="John Doe"]',
        stp1:'div[class="card"] div div:nth-child(3)',
        stp3: 'div[class="card"] div div:nth-child(3)',
        email :'input[placeholder="you@example.com"]',
        password:'input[placeholder="Min. 8 characters"]',
        continueButt:'button[type="submit"]',
        stp2: 'div[class="card"] div div:nth-child(2)',
        country: 'form > div > select',
        conButtstp2: 'button[type="submit"]',
        priGlobal: 'body > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > form:nth-child(3) > div:nth-child(3) > div:nth-child(2)',
        getStarted: 'button[type="submit"]',
         }


  //Methords


  
     enterFullName(FName){
        cy.get(this.weblocators.fullName).clear().type(FName)
                
    }

    
     clickPaidButt(){
        cy.get(this.weblocators.getFreeTrialButt).click()
                
    }

       clickGetStartedButt(){
        cy.get(this.weblocators.getStarted).click()
                
    }

     
     selectPaid(){
        cy.get(this.weblocators.priGlobal).click()
                
    }
    
    
     clickContinueeButt(){
        cy.get(this.weblocators.conButtstp2).click()
                
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

       saveEnteredEmail() {
    return this.elements.email().invoke('val');
  }

    enterPassword(Password){

        cy.get(this.weblocators.password, { timeout: 20000 }).clear().type(Password)
       
    }

    
    clickContunueeButton(){

       cy.get(this.weblocators.continueButt).click()
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

    

    validateDashboard(name){
        
        cy.get(this.weblocators.dashboard).should('be.visible')
       // cy.get()
    }


    
        validateStep1(){

        cy.get(this.weblocators.stp1).should('be.visible')
    }


    validateStep2(){

        cy.get(this.weblocators.stp2).should('be.visible')
    }
      validateStep3(){

        cy.get(this.weblocators.stp3).should('be.visible')
    }


    

    selectRandomCountry(){

cy.get(this.weblocators.country)
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


}
export default signUpPaid;