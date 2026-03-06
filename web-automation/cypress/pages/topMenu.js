class topMenu{

  topMenu = {
    features: () => cy.contains('Features'),
    pricing: () => cy.contains('Pricing'),
    templates: () => cy.contains('Templates'),
    aboutUs: () => cy.contains('About Us'),
    contactUs: () => cy.contains('Contact Us'),
    ENButt:() => cy.get('.gap-3 > .relative > .flex'),
    flag: () => cy.contains('🇬🇧'),
    languageName: () => cy.contains('English'),
    getFreeStartButt: () => cy.contains('Get Started Free'),
    startBuildingForFreeButt: () => cy.contains('Start Building for Free'),
    startBuildingFreeButt: ()=> cy.contains('Start Building Free'),
    loginButt: ()=> cy.contains('Log In'),
    getStartFreeButt: ()=> cy.contains('Get Started'),
    upgradNoProButt: ()=> cy.contains('Upgrade Now'),
    enterpriseButt: ()=> cy.get('.mt-10 > :nth-child(3) > a > .inline-flex'),
    yearly: ()=> cy.contains('Yearly'),
    monthly: ()=> cy.contains('Monthly')
  
      } 

 
 

  languageDropdown() {
    return cy.get(this.topMenu.ENButt)
  }

  languageOptions() {
    return cy.get(this.topMenu.languageName)
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
