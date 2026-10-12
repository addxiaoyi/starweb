import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildPasswordlessEmailContent,
  getPasswordlessSmtpSettings,
  isSmtpConfigured,
} from '../../../src/auth/supertokensEmailDelivery.js'
import { createPasswordlessRecipe } from '../../../src/auth/supertokensInit.js'

const completeEnv = {
  SUPERTOKENS_SMTP_HOST: 'smtp.example.com',
  SUPERTOKENS_SMTP_PORT: '465',
  SUPERTOKENS_SMTP_SECURE: 'true',
  SUPERTOKENS_SMTP_USER: 'mailer@example.com',
  SUPERTOKENS_SMTP_PASSWORD: 'test-password',
  SUPERTOKENS_SMTP_FROM_EMAIL: 'noreply@example.com',
  SUPERTOKENS_SMTP_FROM_NAME: 'StarMC',
}

describe('Passwordless SMTP configuration', () => {
  it('maps production SMTP environment into SuperTokens settings', () => {
    assert.deepEqual(getPasswordlessSmtpSettings(completeEnv, { required: true }), {
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      authEnabled: true,
      authUsername: 'mailer@example.com',
      password: 'test-password',
      from: { email: 'noreply@example.com', name: 'StarMC' },
    })
  })

  it('fails loudly when required SMTP fields are missing', () => {
    assert.throws(
      () => getPasswordlessSmtpSettings({}, { required: true }),
      /SUPERTOKENS_SMTP_HOST/
    )
  })

  it('reports incomplete optional SMTP as unavailable', () => {
    assert.equal(isSmtpConfigured({ SUPERTOKENS_SMTP_HOST: 'smtp.example.com' }), false)
  })

  it('builds a bilingual code email', () => {
    const content = buildPasswordlessEmailContent({
      email: 'player@example.com',
      userInputCode: '123456',
    })

    assert.equal(content.toEmail, 'player@example.com')
    assert.match(content.subject, /StarMC/)
    assert.match(content.body, /123456/)
    assert.match(content.body, /验证码/)
    assert.match(content.body, /verification code/i)
  })

  it('creates an email user-input-code recipe with SMTP delivery', () => {
    let recipeInput

    class FakeSmtpService {
      constructor(input) {
        this.input = input
      }
    }

    const recipe = createPasswordlessRecipe({
      env: completeEnv,
      required: true,
      PasswordlessRecipe: {
        init(input) {
          recipeInput = input
          return 'passwordless-recipe'
        },
      },
      SmtpService: FakeSmtpService,
    })

    assert.equal(recipe, 'passwordless-recipe')
    assert.equal(recipeInput.contactMethod, 'EMAIL')
    assert.equal(recipeInput.flowType, 'USER_INPUT_CODE')
    assert.equal(recipeInput.emailDelivery.service.input.smtpSettings.host, 'smtp.example.com')
  })
})
