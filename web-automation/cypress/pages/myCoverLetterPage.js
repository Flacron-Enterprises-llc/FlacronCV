class myCoverLetterPage{

     //Locators
    weblocators={
        projectCart: 'main.flex-1 > div.space-y-6 > div.grid',
        name: 'input[placeholder="Your name"]',
        email: 'input[type="email"]',
       
    cart: 'div[class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"]',
    cardContainer: '.rounded-xl', // The main card wrapper from your HTML
   // toastMsg: '[role="status"], .toast, .notification', // Common toast selectors
    editBtn: 'button:contains("Edit")',
    duplicateBtn: 'button:contains("Duplicate")',
    deleteIcon: 'button[aria-label="Delete cover letter"]',
  
    deleteBut: 'confirmDeleteBtn: "button"',
    msg: 'ol[dir="ltr"] li div div',
     // cvTitles : '.rounded-lg h3, .rounded-lg div:contains("Updated")', // adjust if needed
     coverLetterTitles: () => cy.get('h3'),
     areaText: 'div.flex-1 > div > div.tiptap',
     
  recipientName: '[style="font-weight: 600;"]',
  companyName: ':nth-child(1) > .p-4 > .mb-2 > :nth-child(2)',
  jobTitle: ':nth-child(1) > .p-4 > .mb-2 > :nth-child(3)',
 aiIcon: ':nth-child(1) > .p-4 > .mb-3 > .bg-brand-100',

 companyNameEditPage: '#cl-preview-content div[style*="color: rgb(85, 85, 85)"]',
 JobTitleEditPage: '#cl-preview-content'


    }


    validateAIicon(){

        cy.get(this.weblocators.aiIcon).should('be.visible')
    }

    validateAIiconNotPresent(){
cy.get(this.weblocators.aiIcon).should('not.exist')

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

    NavigateMyCoverLetterPage(){

         cy.visit('/cover-letters');
    cy.wait(200)
   

    }

 clickDuplicateAndEdit(coverLetterName) {
    // 1. Clean the input name just in case
    const cleanedName = coverLetterName.trim();

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

clickDeleteIcon(coverLetterName) {
    const cleanedName = coverLetterName.trim();

    // 1. Click the trash icon on the specific cover letter card
    cy.contains('h3', new RegExp('^' + cleanedName + '$', 'i'))
        .first()
        .parents('.rounded-xl')
        .within(() => {
            cy.get('button[aria-label="Delete cover letter"]')
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


validateCancelDeletion(coverLetterName) {
    const cleanedName = coverLetterName.trim();
    const clTitleRegex = new RegExp('^' + cleanedName + '$', 'i');

    // 1. Open the Delete Modal
    cy.contains('h3', clTitleRegex)
        .first()
        .parents('.rounded-xl')
        .within(() => {
            cy.get('button[aria-label="Delete cover letter"]').click({ force: true });
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

    // B. Verify the cover letter card STILL exists on the page
    cy.contains('h3', clTitleRegex)
        .should('exist')
        .and('be.visible');

    cy.log(`Validated: cover letter "${cleanedName}" remains on page after Cancel.`);
}


validateSuccessMsg() {
    // Standard validation helper
    cy.get(this.weblocators.msg)
        .should('be.visible')
        .and('contain.text', 'cover letter duplicated');
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

        cy.contains('My Cover Letters').should('be.visible')
    }

    clickEditButton(){

        cy.contains('Edit').click()
        cy.wait(200)
        cy.contains('Personal Information').should('be.visible')

    }

    clickDuplicateButton(){

        cy.contains('Duplicate').click()
    }

    validateCreatedCL(value) {
               
  cy.get('body').then(($body) => {
    if ($body.text().includes('Invalid')) {
      cy.contains('Invalid search').should('be.visible');
    } 
    else if ($body.find(this.weblocators.projectCart).length > 0) {
      cy.get(this.weblocators.projectCart)
        .each(($card) => {
          cy.wrap($card)
            .should('contain.text', value);
        });
    } 
    else {
      cy.contains('No cover Letter found').should('be.visible');
    }
  });

}

validateField(value, fieldLocator) {

  cy.get('body').then(($body) => {

    if ($body.text().includes('Invalid')) {
      cy.contains('Invalid search').should('be.visible');
    } 
    
    else if ($body.find(this.weblocators.projectCart).length > 0) {
      cy.get(this.weblocators.projectCart)
        .each(($card) => {
          cy.wrap($card)
            .find(fieldLocator)   // specific field inside card
            .should('contain.text', value);
        });
    } 
    
    else {
      cy.contains('No cover Letter found').should('be.visible');
    }

  });
}

validateRecipientName(value) {
  this.validateField(value, this.weblocators.recipientName);
}

validateCompanyName(value) {
  this.validateField(value, this.weblocators.companyName);
}

validateJobTitle(value) {
  this.validateField(value, this.weblocators.jobTitle);
}


clickEditButton(){

    cy.contains('Edit').click()
  

}

validateDataonEditPage(){

    cy.get('@title').then((title) => {

  cy.get('input[placeholder="Untitled Cover Letter"]', { timeout: 20000 })
    .should('not.have.value', '')
    .and('have.value', title);

});
    cy.wait(200)
    
cy.get(this.weblocators.name)
  .invoke('val')
  .then((value1) => {
    cy.get('@name').then((expectedValue) => {
      expect(value1).to.equal(expectedValue);
    });
  });

  
  cy.get(this.weblocators.email)
  .invoke('val')
  .then((value1) => {
    cy.get('@email').then((expectedValue) => {
      expect(value1).to.equal(expectedValue);
    });
  });


 cy.get('@RName').then((expectedValue) => {
  cy.get('#cl-preview-content')
    .find('div[style*="font-weight: 600"]')
    .first()
    .should('be.visible')
    .and('have.text', expectedValue);
});

   cy.get('@CName').then((expectedValue) => {
    cy.get(this.weblocators.companyNameEditPage)
      .first()
      .should('be.visible')
      .and('contain.text', expectedValue);
  });

    cy.get('@jobTitle').then((expectedValue) => {
    cy.get('#cl-preview-content')
    .should('contain.text', `Position: ${expectedValue}`);
})


     // 1. Get the text from the editor
    cy.get('div.flex-1 > div > div.tiptap')
        .invoke('text')
        .then((editorText) => {
            const trimmedText = editorText.trim();
            
            // 2. SAVE into a Cypress variable (Alias)
            cy.wrap(trimmedText).as('editorContent');
            
            // 3. Continue with your validation logic
            cy.get('[style="margin-bottom: 32px;"]')
                .should('have.length.at.least', 1)
                .then(($els) => {
                    const combinedText = [...$els]
                        .map(el => el.innerText.trim())
                        .join(' ');

                    expect(combinedText).to.include(trimmedText);
                });
   
   
})
    }


    
validateDataonEditPageDuplicate(){ //with area test

    cy.get('@title').then((title) => {

  cy.get('input[placeholder="Untitled Cover Letter"]', { timeout: 20000 })
    .should('not.have.value', '')
    .and('have.value', title + ' (Copy)');

});
    cy.wait(200)
    
cy.get(this.weblocators.name)
  .invoke('val')
  .then((value1) => {
    cy.get('@name').then((expectedValue) => {
      expect(value1).to.equal(expectedValue);
    });
  });

  
  cy.get(this.weblocators.email)
  .invoke('val')
  .then((value1) => {
    cy.get('@email').then((expectedValue) => {
      expect(value1).to.equal(expectedValue);
    });
  });


 cy.get('@RName').then((expectedValue) => {
  cy.get('#cl-preview-content')
    .find('div[style*="font-weight: 600"]')
    .first()
    .should('be.visible')
    .and('have.text', expectedValue);
});

   cy.get('@CName').then((expectedValue) => {
    cy.get(this.weblocators.companyNameEditPage)
      .first()
      .should('be.visible')
      .and('contain.text', expectedValue);
  });

    cy.get('@jobTitle').then((expectedValue) => {
    cy.get('#cl-preview-content')
    .should('contain.text', `Position: ${expectedValue}`);
})


     // 1. Get the text from the editor
    cy.get('div.flex-1 > div > div.tiptap')
        .invoke('text')
        .then((editorText) => {
            const trimmedText = editorText.trim();
            
            // 2. SAVE into a Cypress variable (Alias)
            cy.wrap(trimmedText).as('editorContent');
            
            // 3. Continue with your validation logic
            cy.get('[style="margin-bottom: 32px;"]')
                .should('have.length.at.least', 1)
                .then(($els) => {
                    const combinedText = [...$els]
                        .map(el => el.innerText.trim())
                        .join(' ');

                    expect(combinedText).to.include(trimmedText);
                });
   
   
})
    }


    
validateDataonEditPageDuplicate2(){ // for create blank button withotu RName

    cy.get('@title').then((title) => {

  cy.get('input[placeholder="Untitled Cover Letter"]', { timeout: 20000 })
    .should('not.have.value', '')
    .and('have.value', title + ' (Copy)');

});
    cy.wait(200)
    
cy.get(this.weblocators.name)
  .invoke('val')
  .then((value1) => {
    cy.get('@name').then((expectedValue) => {
      expect(value1).to.equal(expectedValue);
    });
  });

  
  cy.get(this.weblocators.email)
  .invoke('val')
  .then((value1) => {
    cy.get('@email').then((expectedValue) => {
      expect(value1).to.equal(expectedValue);
    });
  });



   cy.get('@CName').then((expectedValue) => {
    cy.get(this.weblocators.companyNameEditPage)
      .first()
      .should('be.visible')
      .and('contain.text', expectedValue);
  });

    cy.get('@jobTitle').then((expectedValue) => {
    cy.get('#cl-preview-content')
    .should('contain.text', `Position: ${expectedValue}`);
})


     // 1. Get the text from the editor
    cy.get('div.flex-1 > div > div.tiptap')
        .invoke('text')
        .then((editorText) => {
            const trimmedText = editorText.trim();
            
            // 2. SAVE into a Cypress variable (Alias)
            cy.wrap(trimmedText).as('editorContent');
            
            // 3. Continue with your validation logic
            cy.get('[style="margin-bottom: 32px;"]')
                .should('have.length.at.least', 1)
                .then(($els) => {
                    const combinedText = [...$els]
                        .map(el => el.innerText.trim())
                        .join(' ');

                    expect(combinedText).to.include(trimmedText);
                });
   
   
})
    }

  
validateDataonEditPageDuplicate3(){ //without area test with create blank but

    cy.get('@title').then((title) => {

  cy.get('input[placeholder="Untitled Cover Letter"]', { timeout: 20000 })
    .should('not.have.value', '')
    .and('have.value', title + ' (Copy)');

});
    cy.wait(200)
    
cy.get(this.weblocators.name)
  .invoke('val')
  .then((value1) => {
    cy.get('@name').then((expectedValue) => {
      expect(value1).to.equal(expectedValue);
    });
  });

  
  cy.get(this.weblocators.email)
  .invoke('val')
  .then((value1) => {
    cy.get('@email').then((expectedValue) => {
      expect(value1).to.equal(expectedValue);
    });
  });



   cy.get('@CName').then((expectedValue) => {
    cy.get(this.weblocators.companyNameEditPage)
      .first()
      .should('be.visible')
      .and('contain.text', expectedValue);
  });

    cy.get('@jobTitle').then((expectedValue) => {
    cy.get('#cl-preview-content')
    .should('contain.text', `Position: ${expectedValue}`);
})

    }


    
validateDataonEditPage2(){ //where we do not have to validate area

    cy.get('@title').then((title) => {

  cy.get('input[placeholder="Untitled Cover Letter"]', { timeout: 20000 })
    .should('not.have.value', '')
    .and('have.value', title);

});
    cy.wait(200)
    
cy.get(this.weblocators.name)
  .invoke('val')
  .then((value1) => {
    cy.get('@name').then((expectedValue) => {
      expect(value1).to.equal(expectedValue);
    });
  });

  
  cy.get(this.weblocators.email)
  .invoke('val')
  .then((value1) => {
    cy.get('@email').then((expectedValue) => {
      expect(value1).to.equal(expectedValue);
    });
  });



   cy.get('@CName').then((expectedValue) => {
    cy.get(this.weblocators.companyNameEditPage)
      .first()
      .should('be.visible')
      .and('contain.text', expectedValue);
  });

    cy.get('@jobTitle').then((expectedValue) => {
    cy.get('#cl-preview-content')
    .should('contain.text', `Position: ${expectedValue}`);
})
  
       
}


validateDataonEditPage3(){

    cy.get('@title').then((title) => {

  cy.get('input[placeholder="Untitled Cover Letter"]', { timeout: 20000 })
    .should('not.have.value', '')
    .and('have.value', title);

});
    cy.wait(200)
    
cy.get(this.weblocators.name)
  .invoke('val')
  .then((value1) => {
    cy.get('@name').then((expectedValue) => {
      expect(value1).to.equal(expectedValue);
    });
  });

  
  cy.get(this.weblocators.email)
  .invoke('val')
  .then((value1) => {
    cy.get('@email').then((expectedValue) => {
      expect(value1).to.equal(expectedValue);
    });
  });


   cy.get('@CName').then((expectedValue) => {
    cy.get(this.weblocators.companyNameEditPage)
      .first()
      .should('be.visible')
      .and('contain.text', expectedValue);
  });
 

    
}



validateDataonEditPageforDuplicate(){

    cy.get('@title').then((title) => {

  cy.get('input[placeholder="Untitled Cover Letter"]', { timeout: 20000 })
    .should('not.have.value', '')
    .and('have.value', title +' (Copy)');

});
    cy.wait(200)
    
cy.get(this.weblocators.name)
  .invoke('val')
  .then((value1) => {
    cy.get('@name').then((expectedValue) => {
      expect(value1).to.equal(expectedValue);
    });
  });

  
  cy.get(this.weblocators.email)
  .invoke('val')
  .then((value1) => {
    cy.get('@email').then((expectedValue) => {
      expect(value1).to.equal(expectedValue);
    });
  });


   cy.get('@CName').then((expectedValue) => {
    cy.get(this.weblocators.companyNameEditPage)
      .first()
      .should('be.visible')
      .and('contain.text', expectedValue);
  });
 

    
}




}

export default myCoverLetterPage