class landingPage {

  getStartedFreeHero() {
    return cy.get('a[href="/signup"]')
  }

  watchDemoButton() {
    return cy.get('a[href="/demo"]')
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
