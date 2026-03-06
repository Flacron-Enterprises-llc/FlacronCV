class footer {

      footer = {
   
    testimonials: () => cy.contains('Testimonials'),
    flacronGroup: () => cy.contains('Flacron Group'),
    terms:() => cy.contains('Terms of Service'),
    cookie: () => cy.contains('Cookie Policy'),
    policy: () => cy.contains('Privacy Policy')

  } 

}
export default footer;