class authPage {


  
    weblocators={

       
        email :'#email',
        pw: '#password',
        button:'button[type="submit"]',
        title:'.login-subtitle',
        logout: 'button:has-text("Logout")',
       
     
          

    }

  
  validateDashboard(){

    cy.scrollTo('top')
    cy.contains('Welcome').should('be.visible')
    
  }

  validateForgotPw(){

    cy.contains('Forgot password?').click()
    cy.verifyPageIsNotBlank()
  }

    
  clickLogout(){

    cy.contains('Logout').click()
    

  }


     enterValidEmail(Email){
        cy.get(this.weblocators.email).type(Email)
                
    }

    validateWindowTitle(){

        cy.get(this.weblocators.title).should('have.text', 'Sign in to your FlacronCV account');

    }

    enterPassword(password){

         cy.get(this.weblocators.pw).type(password)
    }


    clickButton(){

        cy.get(this.weblocators.button).click()
    }


    validateEmailField(email){
        cy.get(this.weblocators.email).type(email)
        cy.get(this.weblocators.email).then(($input) => {
    expect($input[0].validationMessage).to.contain('@')
  })
                
    }

     validateEmptyEmail(){
  
      cy.get(this.weblocators.email)
      .invoke('prop', 'validationMessage')
    .should('contain', 'Please fill out this field'); 
       
       

       
    }

      validateEmptypPw(){

        
 cy.get(this.weblocators.pw)
      .invoke('prop', 'validationMessage')
    .should('contain', 'Please fill out this field'); 
       
       
    }



     validateWrongEmail(){

       
       cy.wait(300)

        cy.contains('Firebase: Error (auth/invalid-credential).')
      .should('be.visible')
   
       
    }

      validateWrongPassword(){

        
        cy.contains('Firebase: Error (auth/invalid-credential).')
      .should('be.visible')
       
    }

          validateWrongEmailAndPw(){

        
          cy.contains('Firebase: Error (auth/invalid-credential).')
      .should('be.visible')
       
    }

    validateCreateAccoutnLink(){

      cy.contains('Create Account').click()
      cy.url().should('include', 'https://flacroncv-web.onrender.com/en/register')
    }

}

export default authPage
