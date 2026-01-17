     Cypress.Commands.add('selectRandomOption', (selector) => {
      cy.get(selector)
        .find('option')
        .its('length')
        .then((optionsLength) => {
          // Generate a random index, excluding the first "Please select" option if present
          const randomIndex = Cypress._.random(1, optionsLength - 1); 
          cy.get(selector).select(randomIndex);
        });
    });
