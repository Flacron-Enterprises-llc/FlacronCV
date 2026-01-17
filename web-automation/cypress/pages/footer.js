class footer {

      footer = {
    example: () => cy.get('[href="/examples"]'),
    blog: () => cy.get('[href="/blog"]'),
    careerGuide: () => cy.get('[href="/guides"]'),
    about: () => cy.get('.header-desktop-nav > [href="/about"]'),
    support:() => cy.get('[href="/support"]'),
    api: () => cy.get('[href="/api"]'),
    carrer: () => cy.get('[href="/careers"]'),
    contact: () => cy.get('[href="/contact"]'),
    policy: () => cy.get(':nth-child(4) > [href="/privacy"]')

  } 

}
export default footer;