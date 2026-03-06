class landingPage {

 
  getStartFreeButt(){

    cy.contains('Get Started Free').click()
  }



  countryButtons() {
    return cy.get('section button').contains('United States')
      .parent()
      .find('button')
  }

  clickAnyCountry() {
    this.countryButtons().eq(1).click()
  }

  heroTitle() {
    return cy.get('.hero-title')
  }
}

export default landingPage
