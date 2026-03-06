import headerPage from '../../pages/topMenu'
import landingPage from '../../pages/landingPage'
import footer from '../../pages/footer'
import { slowCypressDown } from 'cypress-slow-down'
import 'cypress-plugin-steps'

const viewports = [
  { name: 'mobile', width: 375, height: 667 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'desktop', width: 1920, height: 1080 }
];

describe('FlacronCV Landing Page – POM Based Automation', () => {

  const header = new headerPage()
  const landing = new landingPage()
  const footerObj = new footer()
 
    const registrationPath = '/register'

  beforeEach(() => {
  
    cy.visit('/')
  })

      slowCypressDown(500) 
   it('TC-1: Verify Features  option from top menu options navigation',{ retries: 2 }, () => {
   header.topMenu.features().click()
    cy.contains('AI Writing Assistant').should('be.visible')
      
  })

   it('TC-2: Verify Pricing  option from top menu options navigation',{ retries: 2 }, () => {
   header.topMenu.pricing().click()
    cy.contains('Most Popular').should('be.visible')
    
  })

    it('TC-3: Verify Templates option from top menu options navigation',{ retries: 2 }, () => {
    header.topMenu.templates().click()
    cy.url().should('include', '/templates')
      cy.verifyPageIsNotBlank()
  })


     it('TC-4: Verify About Us option from top menu options navigation',{ retries: 2 }, () => {
   
    header.topMenu.aboutUs().click()
    cy.url().should('include', '/about-us')
      cy.verifyPageIsNotBlank()
  })



  it('TC-5: Verify Login button navigation',{ retries: 2 }, () => {
    header.topMenu.loginButt().click()
    cy.url().should('include', '/login')
     cy.verifyPageIsNotBlank()
  })

  it('TC-6: Verify Get Started Free button from header',{ retries: 2 }, () => {
    header.topMenu.getFreeStartButt().click()
    cy.url().should('include', '/register')
     cy.verifyPageIsNotBlank()
  })



it('TC-7: Redirects to Registration page when Get Started button is clicked',{ retries: 2 }, () => {
 
  //cy.get('.hero-actions > .btn-primary')  //Get start free button next to Watch Demo button
  header.topMenu.startBuildingForFreeButt().click()
 
cy.url().should('include', '/register')
     cy.verifyPageIsNotBlank()
})


it('TC-8: varify start building free button',{ retries: 2 }, () => {
 
  header.topMenu.startBuildingFreeButt().click()


cy.url().should('include', '/register')
     cy.verifyPageIsNotBlank()
})


it('TC-9: varify get started button',{ retries: 2 }, () => {
 
  header.topMenu.getStartFreeButt().click()

cy.url().should('include', '/register')
     cy.verifyPageIsNotBlank()
})


it('TC-10: varify upgrad now button',{ retries: 2 }, () => {
 
  header.topMenu.upgradNoProButt().click()
  
cy.url().should('include', '/register')
     cy.verifyPageIsNotBlank()
})


it.only('TC-11: varify Enterprise button',{ retries: 2 }, () => {
 

 header.topMenu.pricing().click()
 cy.wait(2000)
cy.get('div.mt-10 > div.relative > a').should('be.visible').click({ multiple: true })

cy.url().should('include', '/contact-us')
     cy.verifyPageIsNotBlank()
     
})



      it('TC-12: Verify Testimonials option from footer menu options navigation',{ retries: 2 }, () => {
    footerObj.footer.testimonials().click()
    cy.url().should('include', 'testimonials')
      cy.verifyPageIsNotBlank()
  })
     it('TC-13: Verify Flacron Group option from footer menu options navigation',{ retries: 2 }, () => {
    footerObj.footer.flacronGroup() .scrollIntoView()
  .invoke('removeAttr', 'target').click()
    cy.url().should('include', 'https://flacronenterprises.com/')
      cy.verifyPageIsNotBlank()
  })

     it('TC-14: Verify Terms of Service option from footer menu options navigation',{ retries: 2 }, () => {
    footerObj.footer.terms().click()
    cy.url().should('include', 'terms-of-service')
      cy.verifyPageIsNotBlank()
  })




   it('TC-15: Verify Privacy Policy  option from footer menu options navigation',{ retries: 2 }, () => {
    footerObj.footer.policy().click()
    cy.url().should('include', 'privacy-policy')
      cy.verifyPageIsNotBlank()
  })

     it('TC-16: Verify Cookie Policy  option from footer menu options navigation',{ retries: 2 }, () => {
    footerObj.footer.cookie().click()
    cy.url().should('include', 'cookie-policy')
      cy.verifyPageIsNotBlank()
  })

it('TC-17: Displays selected language as a GUI flag, not text',{ retries: 2 }, () => {

  header.topMenu.ENButt().click()
  
   header.topMenu.flag()
    .should('be.visible')
    .then(($flag) => {

      const text = $flag.text().trim()
      const hasImage =
        $flag.find('img').length > 0 ||
        $flag.find('svg').length > 0 ||
        $flag.css('background-image') !== 'none'

      if (!hasImage) {
        throw new Error(`
❌ LANGUAGE FLAG UI ERROR

The selected language flag is not displayed as a graphical flag icon.

Expected:
• A visible flag image (icon / SVG / background image)

Actual:
• Text displayed instead: "${text}"

Impact:
• Flag is missing,only code displayed

        `)
      }
    })
})


  const languages = [
   // 'English',
    'Español',
    'Français',
    'Deutsch',
    'العربية',
    'اردو'
  ]

  languages.forEach((lang) => {

    it(`TC-18: Select language: ${lang}`,{ retries: 2 }, () => {

      // Open language dropdown
      cy.contains('EN')
        .click()

      // Select language
      cy.contains(lang)
        .scrollIntoView()
        .should('be.visible')
        .click()

      // Wait for translation
      cy.wait(2000)

      // Verify language changed (Example text check)
    cy.contains('Get Your CV Ready in 3 Steps')
      .should('not.exist')
    })

  

})

// test responsive test on mobile, tablet and desktop devices

viewports.forEach(viewport => {

    it(`TC-19: UI should display correctly on ${viewport.name}`,{ retries: 2 }, () => {

      cy.viewport(viewport.width, viewport.height);
     
      // Header should be visible
     cy.get('nav.fixed > div.mx-auto')
        .should('be.visible')
        .and('not.have.css', 'overflow', 'hidden');

      // Main content should be visible
      cy.get('main')
        .should('be.visible');

      // Navigation should not overlap content
    cy.get('nav').then((nav) => {
  cy.get('main').then((main) => {

    const navRect = nav[0].getBoundingClientRect();
    const mainRect = main[0].getBoundingClientRect();

   expect(navRect.bottom).to.be.lessThan(mainRect.top + 70);

  });
});

      // Buttons should be visible and clickable
      cy.get('button')
        .should('be.visible')
        .and('not.be.disabled');

    });

  });



})
