
Cypress.Commands.add("selectRandom", (btnSelector) => {

 cy.get(btnSelector).click({ force: true });



  return cy.get('[role="option"]')
    .should('be.visible')
    .then($options => {

      const randomIndex = Math.floor(Math.random() * $options.length);
      const randomOption = $options[randomIndex];
      const selectedText = randomOption.innerText;

      cy.wrap(randomOption).click({ force: true });

      // IMPORTANT: Wrap the return value
      return cy.wrap(selectedText);
    });
});
