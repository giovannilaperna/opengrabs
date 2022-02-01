import asyncHandler from 'express-async-handler'
import { authorizeUser } from '../auth'
import { q, client } from '../db'
import { transporter } from '../email'
import * as en from '../email/en'
import * as es from '../email/es'
import * as pt from '../email/pt'
import * as ru from '../email/ru'
import { Router } from 'express'
const router = Router()
  
router.get('/db/user/get', authorizeUser, asyncHandler(async (req, res) => {
  const { jwt } = req.body
  const sub = jwt.sub

  const exists = await client.query(
    q.Exists(
      q.Match(q.Index('user_by_sub'), sub)
    )
  )
  if (exists) {
    const { data: user } = await client.query(
      q.Get(
        q.Match(q.Index('user_by_sub'), sub)
      )
    )
    res.status(200).json(user)
    return
  } else {
    res.status(200).json({})
    return
  }
}))

router.post('/db/user/create', authorizeUser, asyncHandler(async (req, res) => {
  const { jwt } = req.body
  const sub = jwt.sub

  let strategy = jwt['https://opengrabs.com/strategy']
  if (!strategy) strategy = jwt.sub.split('|')[0]

  let props, email_verified, email
  switch (strategy) {
    case 'facebook':
      email = jwt['https://opengrabs.com/email']
      email_verified = jwt['https://opengrabs.com/verified']
      props = {
        sub: sub,
        email: email,
        email_verified: email_verified,
      }
      break
    case 'vkontakte':
      email = jwt['https://opengrabs.com/email']
      props = {
        sub: sub,
        email: email,
        email_verified: (email) ? true : false,
      }
      break
    case 'email':
      email = jwt['https://opengrabs.com/name']
      email_verified = jwt['https://opengrabs.com/verified']
      props = {
        sub: sub,
        email: email,
        email_verified: email_verified,
      }
  }

  const exists = await client.query(
    q.Exists(
      q.Match(q.Index('user_by_sub'), sub)
    )
  )

  if (!exists) {
    await client.query(
      q.Create(
        q.Collection('users'),
        { data: props }
      )
    )
    res.status(200).json(props)
    return
  } else {

    const { data: user } = await client.query(
      q.Get(
        q.Match(q.Index('user_by_sub'), sub)
      )
    )
    res.status(200).json(user)
    return
  }
}))

router.post('/db/user/update', authorizeUser, asyncHandler(async (req,res) => {
  const { jwt, props } = req.body
  
  const { ref: {value: { id }}} = await client.query(
    q.Get(
      q.Match(q.Index('user_by_sub'), jwt.sub)
    )
  )
  
  const { data: user } = await client.query(
    q.Update(
      q.Ref(q.Collection('users'), id),
      { data: props },
    )
  )

  res.status(200).json(user)
}))

router.post('/db/user/update/email', authorizeUser, asyncHandler(async (req,res) => {
  const { jwt, props } = req.body

  props.email_verified = false
  props.code = Math.floor(100000 + Math.random() * 900000);
  
  const { ref: {value: { id }}} = await client.query(
    q.Get(
      q.Match(q.Index('user_by_sub'), jwt.sub)
    )
  )
  
  const { data: user } = await client.query(
    q.Update(
      q.Ref(q.Collection('users'), id),
      { data: props },
    )
  )

  let emailContent
  switch (props.locale) {
    case 'en':
      emailContent = en.emailConfirmationCode(props.code)
    case 'es':
      emailContent = es.emailConfirmationCode(props.code)
    case 'pt':
      emailContent = pt.emailConfirmationCode(props.code)
    case 'ru':
      emailContent = ru.emailConfirmationCode(props.code)
    default:
      emailContent = en.emailConfirmationCode(props.code)
  }

  await transporter.sendMail({
    to: props.email,
    subject: emailContent.subject,
    text: emailContent.content,
  })

  res.status(200).json(user)
}))

router.post('/db/user/verify/:code', authorizeUser, asyncHandler(async (req,res) => {
  const { jwt } = req.body
  const { code } = req.params
  
  const { data, ref: {value: { id }}} = await client.query(
    q.Get(
      q.Match(q.Index('user_by_sub'), jwt.sub)
    )
  )

  if (data.code === parseInt(code)) {
    const { data: user} = await client.query(
      q.Update(
        q.Ref(q.Collection('users'), id),
        { data: { email_verified: true } },
      )
    )
    res.status(200).json(user)
    return
  } else {
    res.status(200).json({ error: 'invalid code'})
  }
}))

router.post('/db/user/update/username', authorizeUser, asyncHandler(async (req,res) => {
  const { jwt, props } = req.body

  const exists = await client.query(
    q.Exists(
      q.Match(q.Index('user_by_username'), props.username)
    )
  )

  if (exists) {
    res.status(200).json({ error: 'Username already in use'})
    return
  }

  const { ref: {value: { id }}} = await client.query(
    q.Get(
      q.Match(q.Index('user_by_sub'), jwt.sub)
    )
  )

  const { data: user} = await client.query(
    q.Update(
      q.Ref(q.Collection('users'), id),
      { data: props },
    )
  )

  res.status(200).json(user)
}))

module.exports = router
  