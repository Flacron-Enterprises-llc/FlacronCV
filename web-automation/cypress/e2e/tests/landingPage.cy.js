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

   it('TC-1: Verify Features  option from top menu options navigation', () => {
   header.topMenu.features().click()
    cy.url().should('include', '/features')
      cy.verifyPageIsNotBlank()
  })

   it('TC-2: Verify Pricing  option from top menu options navigation', () => {
   header.topMenu.pricing().click()
    cy.url().should('include', '/pricing')
      cy.verifyPageIsNotBlank()
  })

    it('TC-3: Verify Templates option from top menu options navigation', () => {
    header.topMenu.templates().click()
    cy.url().should('include', '/templates')
      cy.verifyPageIsNotBlank()
  })


     it('TC-4: Verify About option from top menu options navigation', () => {
   
    header.topMenu.about().click()
    cy.url().should('include', '/about')
      cy.verifyPageIsNotBlank()
  })



  it('TC-5: Verify Login button navigation', () => {
    header.loginButton().click()
    cy.url().should('include', '/login')
     cy.verifyPageIsNotBlank()
  })

  it('TC-6: Verify Get Started Free button from header', () => {
    header.getStartedFreeButton().click()
    cy.url().should('include', '/register')
     cy.verifyPageIsNotBlank()
  })

  it('TC-7: Verify Watch Demo button', () => {
    landing.watchDemoButton().click()
    cy.url().should('include', '/demo')
     cy.verifyPageIsNotBlank()
  })

it('TC-8: Redirects to Registration page when Get Started button is clicked', () => {
 
  //cy.get('.hero-actions > .btn-primary')  //Get start free button next to Watch Demo button
  header.topMenu.GetFreeStartButt()
  .should('be.visible')
    .click()

  cy.location('pathname').then((path) => {
    if (path !== '/register') {
      throw new Error(`
❌ REDIRECTION FAILED

The "Get Started" button did not redirect to the Registration page.

Expected URL:
  /register

Actual URL:
  ${path}

Impact:
• User cannot sign up from the landing page
• Critical conversion flow is broken, Get start from top menu and all 
other Get start buttons are redirected to change registartion page.All Get start
free buttons should be redirected to the same Registration Page.
      `)
    }
  })

  // Optional: ensure page is not blank
  cy.verifyPageIsNotBlank()
})


    it('TC-9: Verify Example option from footer menu options navigation', () => {
    footerObj.footer.example().click()
    cy.url().should('include', '/example')
      cy.verifyPageIsNotBlank()
  })

  
    it('TC-10: Verify Blog option from footer menu options navigation', () => {
    footerObj.footer.blog().click()
    cy.url().should('include', '/blog')
      cy.verifyPageIsNotBlank()
  })

      it('TC-11: Verify Carrer Guide option from footer menu options navigation', () => {
    footerObj.footer.careerGuide().click()
    cy.url().should('include', '/guide')
      cy.verifyPageIsNotBlank()
  })
     it('TC-12: Verify Support option from footer menu options navigation', () => {
    footerObj.footer.support().click()
    cy.url().should('include', '/support')
      cy.verifyPageIsNotBlank()
  })

     it('TC-13: Verify API option from footer menu options navigation', () => {
    footerObj.footer.api().click()
    cy.url().should('include', '/api')
      cy.verifyPageIsNotBlank()
  })

    it('TC-14: Verify Carrers option from footer menu options navigation', () => {
    footerObj.footer.carrer().click()
    cy.url().should('include', '/careers')
      cy.verifyPageIsNotBlank()
  })

   it('TC-15: Verify Contact  option from footer menu options navigation', () => {
    footerObj.footer.contact().click()
    cy.url().should('include', '/contact')
      cy.verifyPageIsNotBlank()
  })

   it('TC-16: Verify Policy  option from footer menu options navigation', () => {
    footerObj.footer.policy().click()
    cy.url().should('include', '/privacy')
      cy.verifyPageIsNotBlank()
  })

  it('TC-17: Redirects to Registration page when Get Started button is clicked from bottom of the page', () => {
 
  //cy.get('.hero-actions > .btn-primary')  //Get start free button next to Watch Demo button
  header.topMenu.getStartFreeButtFromBottom()
  .should('be.visible')
    .click()

  cy.location('pathname').then((path) => {
    if (path !== '/register') {
      throw new Error(`
❌ REDIRECTION FAILED

The "Get Started" button did not redirect to the Registration page.

Expected URL:
  /register

Actual URL:
  ${path}

Impact:
• User cannot sign up from the landing page
• Critical conversion flow is broken, Get start from top menu and all 
other Get start buttons are redirected to change registartion page.All Get start
free buttons should be redirected to the same Registration Page.
      `)
    }
  })

  // Optional: ensure page is not blank
  cy.verifyPageIsNotBlank()
})


    it('TC-18: Verify Browse Templates button from bottom of the page navigation', () => {
    header.topMenu.browserTemButt().click()
     cy.location('pathname').then((path) => {
    if (path !== '/register') {
      throw new Error(`
❌ REDIRECTION FAILED

The "Get Started" button did not redirect to the Registration page.

Expected URL:
  /register

Actual URL:
  ${path}

Impact:
• User cannot sign up from the landing page
• Critical conversion flow is broken, Get start from top menu and all 
other Get start buttons are redirected to change registartion page.All Get start
free buttons should be redirected to the same Registration Page.
      `)
    }
  })

  // Optional: ensure page is not blank
  cy.verifyPageIsNotBlank()

    cy.url().should('include', '/templates')
      cy.verifyPageIsNotBlank()
  })

  
    it('TC-19: Verify Get started button form Starter section', () => {
    header.topMenu.getStartButtFromStarter().click()
     cy.location('pathname').then((path) => {
    if (path !== '/register') {
      throw new Error(`
❌ REDIRECTION FAILED

The "Get Started" button did not redirect to the Registration page.

Expected URL:
  /register

Actual URL:
  ${path}

Impact:
• User cannot sign up from the landing page
• Critical conversion flow is broken, Get start from top menu and all 
other Get start buttons are redirected to change registartion page.All Get start
free buttons should be redirected to the same Registration Page.
      `)
    }
  })

  // Optional: ensure page is not blank
  cy.verifyPageIsNotBlank()

  })

   
    it('TC-20: Verify Get start free trial button form Pro Global section', () => {
    header.topMenu.startFreeTrialButt().click()
     cy.location('pathname').then((path) => {
    if (path !== '/register') {
      throw new Error(`
❌ REDIRECTION FAILED

The "Get Started" button did not redirect to the Registration page.

Expected URL:
  /register

Actual URL:
  ${path}

Impact:
• User cannot sign up from the landing page
• Critical conversion flow is broken, Get start from top menu and all 
other Get start buttons are redirected to change registartion page.All Get start
free buttons should be redirected to the same Registration Page.
      `)
    }
  })

  // Optional: ensure page is not blank
  cy.verifyPageIsNotBlank()

  })

it('TC-21: Displays selected language as a GUI flag, not text', () => {
  
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

it('TC-22: Translates the page when a new language is selected', () => {
 
  // Capture text before language change
  cy.get('body').invoke('text').then((beforeText) => {

    // Open language dropdown
    header.topMenu.languageName().click()
   // Select French language
    cy.get('.language-option')
      .contains('.language-name', 'Français')
      .click()

    // Assert selected language is active
    cy.get('.language-option.active .language-name')
      .should('contain.text', 'Français')

      
    // Assert page content has changed
    cy.get('body').invoke('text').then((afterText) => {
      expect(afterText.trim()).to.not.equal(beforeText.trim())
    
    })
  })
})

it('TC-23: Translates the entire page when a non-English language is selected', () => {
 
    // Open language dropdown
    header.topMenu.languageName().click()
  
  // Pick a random language (including English)
  cy.get('.language-option').then($options => {

    const randomIndex = Math.floor(Math.random() * $options.length)
    const selectedOption = $options[randomIndex]

    const selectedLanguage =
      selectedOption.querySelector('.language-name').innerText.trim()

    cy.wrap(selectedOption).click()

    // Assert selected language is active
    cy.get('.language-option.active .language-name')
      .should('contain.text', selectedLanguage)

    // ✅ If English is selected → do NOT validate translation
    if (selectedLanguage === 'English') {
      cy.log('English selected – translation validation skipped')
      return
    }

    // ❗ Validate full-page translation ONLY for non-English languages
    cy.get('body').invoke('text').then(pageText => {

      const englishMarkers = [
        'Everything You Need',
        'How It Works',
        'Choose Your Target',
        'Fill Your Details',
        'Download & Apply',
        'Trusted by',
        'Simple. Transparent Pricing',
        'Ready to Build Your'
      ]

      const untranslated = englishMarkers.filter(marker =>
        pageText.includes(marker)
      )

      if (untranslated.length > 0) {
        cy.screenshot(`partial-translation-${selectedLanguage}-${Date.now()}`)

        throw new Error(`
❌ INCOMPLETE PAGE TRANSLATION

Selected Language:
${selectedLanguage}

The following sections are still in English:
${untranslated.map(t => `• ${t}`).join('\n')}

Expected:
• Entire page translated into "${selectedLanguage}"

Actual:
• Page partially translated

Note:
• English language is excluded from this validation
        `)
      }
    })
  })
})


  viewports.forEach(viewport => {

    it(`TC-24: UI should display correctly on ${viewport.name}`, () => {

      cy.viewport(viewport.width, viewport.height);
     
      // Header should be visible
      cy.get('header')
        .should('be.visible')
        .and('not.have.css', 'overflow', 'hidden');

      // Main content should be visible
      cy.get('main')
        .should('be.visible');

      // Navigation should not overlap content
      cy.get('nav').then(nav => {
        cy.get('main').then(main => {
          const navRect = nav[0].getBoundingClientRect();
          const mainRect = main[0].getBoundingClientRect();

          expect(navRect.bottom).to.be.lessThan(mainRect.top);
        });
      });

      // Buttons should be visible and clickable
      cy.get('button')
        .should('be.visible')
        .and('not.be.disabled');

    });

  });



})
