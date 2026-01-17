class authPage {

  emailField() {
    return cy.get('input[type="email"]')
  }

  passwordField() {
    return cy.get('input[type="password"]')
  }

  submitButton() {
    return cy.get('button[type="submit"]')
  }

  createFreeAccount(email, password) {
    this.emailField().type(email)
    this.passwordField().type(password)
    this.submitButton().click()
  }
}

export default authPage
