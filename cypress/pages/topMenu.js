class topMenu{

  topMenu = {
    features: () => cy.get('.header-desktop-nav > [href="/features"]'),
    
    pricing: () => cy.get('.header-desktop-nav > [href="/pricing"]'),
    templates: () => cy.get('.header-desktop-nav > [href="/templates"]'),
    about: () => cy.get('.header-desktop-nav > [href="/about"]'),
    flag:() => cy.get('.language-switcher-trigger > .language-flag'),
    languageName: () => cy.get('.language-switcher-trigger > .language-name'),
    GetFreeStartButt: () => cy.get('.hero-actions > .btn-primary'),
    getStartFreeButtFromBottom: () => cy.get('[style="text-align: center; max-width: 800px; margin: 0px auto;"] > div > .btn-primary'),
    browserTemButt: () => cy.get('[style="text-align: center; max-width: 800px; margin: 0px auto;"] > div > .btn-secondary'),
    getStartButtFromStarter: () => cy.get('[style="position: relative; display: flex; flex-direction: column; gap: 2rem; transition: transform 0.3s;"] > .btn'),
    startFreeTrialButt: () => cy.get('[style="position: relative; display: flex; flex-direction: column; gap: 2rem; transition: transform 0.3s; transform: scale(1.05); border: 2px solid var(--primary-600);"] > .btn')
    
  
      } 

  loginButton() {
    return cy.get('[href="/login"]')
  }

  getStartedFreeButton() {
    return cy.get('.header-actions > .btn')
  }

  languageDropdown() {
    return cy.get('.language-switcher-trigger')
  }

  languageOptions() {
    return cy.get('.language-option')
  }

  selectRandomLanguage() {
    this.languageDropdown().click()
    this.languageOptions()
      .not('.active')
      .then(options => {
        const randomIndex = Math.floor(Math.random() * options.length)
        cy.wrap(options[randomIndex]).click()
      })
  }
}

export default topMenu;
