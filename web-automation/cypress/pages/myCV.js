
class myCV {
        
    //Locators
    weblocators={
        projectCart: 'main.flex-1 > div.space-y-6 > div.grid',
        firstName: '.shadow-sm > .grid > :nth-child(1) > .input-field',
        lastName: 'input[placeholder="Your last name"]',
        email: 'input[type="email"]',
        ph: '.shadow-sm > .grid > :nth-child(4) > .input-field',
    city: ':nth-child(5) > .input-field',
    country: ':nth-child(6) > .input-field',
    headLine: '[placeholder="e.g. Senior Software Engineer"]',
    summary: ':nth-child(8) > .input-field',
    linkedIn: ':nth-child(9) > .input-field',
    website: '[placeholder="yoursite.com"]',
    cart: 'div[class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"]',
    cardContainer: '.rounded-xl', // The main card wrapper from your HTML
   // toastMsg: '[role="status"], .toast, .notification', // Common toast selectors
    editBtn: 'button:contains("Edit")',
    duplicateBtn: 'button:contains("Duplicate")',
    deleteIcon: 'button[aria-label="Delete CV"]',
  
    deleteBut: 'confirmDeleteBtn: "button"',
    msg: 'ol[dir="ltr"] li div div',
     // cvTitles : '.rounded-lg h3, .rounded-lg div:contains("Updated")', // adjust if needed
     cvTitles: () => cy.get('h3'),
       


    }


   getAllCVTitles() {
  const titles = [];

  cy.get(this.weblocators.cardContainer).each(($card) => {
    cy.wrap($card)
      .find('div')
      .eq(1) // adjust index if needed
      .invoke('text')
      .then((text) => {
        titles.push(text.trim());
      });
  }).then(() => {
    cy.wrap(titles).as('cvTitlesList');
  });
}

getCVTitlesArray() {
        let titles = [];
        return cy.get('h3').each(($el) => {
            titles.push($el.text().trim());
        }).then(() => titles);
    }

/*
    
     getAllCVTitles() {
   
   cy.get(this.weblocators.cardContainer)
  .then($els => {
    const titles = [...$els].map(el => el.innerText.trim());
    cy.wrap(titles).as('cvTitlesList');
  });
  }

  */
  

    NavigateMyCvPage(){

         cy.contains('My CVs').click({force: true})
    cy.wait(200)
   

    }

 clickDuplicateAndEdit(cvName) {
    // 1. Clean the input name just in case
    const cleanedName = cvName.trim();

    // 2. Click Duplicate on the original card
    // We use a regex to find the title even if it's slightly truncated
    cy.contains('h3', new RegExp('^' + cleanedName + '$', 'g'))
        .first() 
        .parents(this.weblocators.cardContainer)
        .within(() => {
            cy.get(this.weblocators.duplicateBtn).click({ force: true });
        });

    // 3. Validate success message
    cy.get( this.weblocators.msg, { timeout: 15000 })
        .should('exist')
        .and('include.text', 'duplicated');

    // 4. Click Edit on the DUPLICATED card
    // REGEX EXPLAINED: This looks for the name followed by any amount of space and "(Copy)"
    // The 'i' flag makes it case-insensitive (handles 'copy' vs 'Copy')
    const duplicateRegex = new RegExp(cleanedName + '.*\\(Copy\\)', 'i');

    cy.contains('h3', duplicateRegex, { timeout: 15000 })
        .should('exist')
        .last() 
        .parents(this.weblocators.cardContainer)
        .within(() => {
            cy.get(this.weblocators.editBtn)
                .should('exist')
                .click({ force: true , multiple: true})
        }); 
         
    cy.log(`Successfully located and clicked Edit for duplicate of: ${cleanedName}`);
}

clickDeleteIcon(cvName) {
    const cleanedName = cvName.trim();

    // 1. Click the trash icon on the specific CV card
    cy.contains('h3', new RegExp('^' + cleanedName + '$', 'i'))
        .first()
        .parents('.rounded-xl')
        .within(() => {
            cy.get('button[aria-label="Delete CV"]')
                .click({ force: true });
        });

    // 2. Target the Modal Overlay specifically
    // We use the 'fixed' class to ensure we are looking at the popup layer
    cy.get('div.fixed.inset-0.z-50', { timeout: 10000 })
        .should('be.visible')
        .within(() => {
            // Now we are inside the modal, find the Red Delete button
            cy.contains('button', 'Delete')
                .should('be.visible')
                .click({ force: true });
        });

    // 3. Optional: Verify the modal is gone
    cy.get('div.fixed.inset-0.z-50').should('not.exist');

    // 4. Validate success message
    cy.get(this.weblocators.msg, { timeout: 15000 })
        .should('exist')
        .and('include.text', 'deleted');
}


validateCancelDeletion(cvName) {
    const cleanedName = cvName.trim();
    const cvTitleRegex = new RegExp('^' + cleanedName + '$', 'i');

    // 1. Open the Delete Modal
    cy.contains('h3', cvTitleRegex)
        .first()
        .parents('.rounded-xl')
        .within(() => {
            cy.get('button[aria-label="Delete CV"]').click({ force: true });
        });

    // 2. Click CANCEL in the Modal
    cy.get('div.fixed.inset-0.z-50')
        .should('be.visible')
        .within(() => {
            cy.contains('button', 'Cancel').click();
        });

    // 3. Assertions
    // A. Verify the modal is closed
    cy.get('div.fixed.inset-0.z-50').should('not.exist');

    // B. Verify the CV card STILL exists on the page
    cy.contains('h3', cvTitleRegex)
        .should('exist')
        .and('be.visible');

    cy.log(`Validated: CV "${cleanedName}" remains on page after Cancel.`);
}


validateSuccessMsg() {
    // Standard validation helper
    cy.get(this.weblocators.msg)
        .should('be.visible')
        .and('contain.text', 'CV duplicated');
}
    
    addingCertificate(){

      cy.get(':nth-child(8) > .inline-flex').click()
      
        cy.log("======= Adding Referance section ======")
  
      cy.get('.absolute > .grid > :nth-child(5)').click()
      cy.get(':nth-child(6) > .border-t > .space-y-3 > .inline-flex').click()
      cy.get('body > div:nth-child(1) > div:nth-child(2) > main:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(6) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > input:nth-child(2)').clear().type('AI')
      cy.get('body > div:nth-child(1) > div:nth-child(2) > main:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(6) > div:nth-child(2) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > textarea:nth-child(2)').clear().type('This is AI related certificate')
      
    }
    clickDashboard(){
        cy.contains('Dashboard').click()
    }
    //functions

    validatePageTitle(){

        cy.contains('My CVs').should('be.visible')
    }

    clickEditButton(){

        cy.contains('Edit').click()
        cy.wait(200)
        cy.contains('Personal Information').should('be.visible')

    }

    clickDuplicateButton(){

        cy.contains('Duplicate').click()
    }

    validateCreatedCV(projectName) {
         
      
  cy.get('body').then(($body) => {
    if ($body.text().includes('Invalid')) {
      cy.contains('Invalid search').should('be.visible');
    } 
    else if ($body.find(this.weblocators.projectCart).length > 0) {
      cy.get(this.weblocators.projectCart)
        .each(($card) => {
          cy.wrap($card)
            .should('contain.text', projectName);
        });
    } 
    else {
      cy.contains('No project found').should('be.visible');
    }
  });

}

clickEditButton(){

    cy.contains('Edit').click()
    cy.wait(200)
    cy.contains('Personal Information').should('be.visible');

}

validateDataonEditPage(){



       cy.get('@title').then( title=> {
       cy.get('.justify-between > .flex.gap-2 > .text-sm' , { timeout: 20000 }).should('contain.text', title);
    });

    cy.wait(200)
    
cy.get(this.weblocators.firstName)
  .invoke('val')
  .then((value1) => {
    cy.get('@typedFirstName').then((expectedValue) => {
      expect(value1).to.equal(expectedValue);
    });
  });

  
  cy.get(this.weblocators.lastName)
  .invoke('val')
  .then((value1) => {
    cy.get('@typedLastName').then((expectedValue) => {
      expect(value1).to.equal(expectedValue);
    });
  });

  cy.get(this.weblocators.ph)
  .invoke('val')
  .then((value1) => {
    cy.get('@typedPH').then((expectedValue) => {
      expect(value1).to.equal(expectedValue);
    });
  });

   cy.get(this.weblocators.city)
  .invoke('val')
  .then((value1) => {
    cy.get('@typedCity').then((expectedValue) => {
      expect(value1).to.equal(expectedValue);
    });
  }); 

     cy.get(this.weblocators.country)
  .invoke('val')
  .then((value1) => {
    cy.get('@typedCountry').then((expectedValue) => {
      expect(value1).to.equal(expectedValue);
    });
  });

    cy.get(this.weblocators.headLine)
  .invoke('val')
  .then((value1) => {
    cy.get('@typedHL').then((expectedValue) => {
      expect(value1).to.equal(expectedValue);
    });
  });

    cy.get(this.weblocators.summary)
  .invoke('val')
  .then((value1) => {
    cy.get('@capturedSummary').then((expectedValue) => {
      expect(value1).to.equal(expectedValue);
    });
  });

    cy.get(this.weblocators.linkedIn)
  .invoke('val')
  .then((value1) => {
    cy.get('@typedLinkedIn').then((expectedValue) => {
      expect(value1).to.equal(expectedValue);
    });
  });
 

  
    cy.get(this.weblocators.website)
  .invoke('val')
  .then((value1) => {
    cy.get('@typedWebsite').then((expectedValue) => {
      expect(value1).to.equal(expectedValue);
    });
  });




}
}

export default myCV
