class logout  {

  

    logout(){

        cy.contains('Logout').click()
    }

    logoutMain(){

         cy.get(':nth-child(3) > .gap-2 > .flex').click()
        cy.contains('Log Out').click()

    }


}

export default logout