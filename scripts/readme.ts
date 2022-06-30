import path from "path"
import fs from "fs-extra"
import { escapeHtml } from "./utils"
import { resolveInfo } from "./loader"
import { QUIZ_ROOT, REPO, DIFFICULTY_COLORS, DIFFICULTY_RANK } from "./configs"
import { defaultLocale, f, SupportedLocale, supportedLocales, t } from "./locales"
import { generateBadge, generateBadgeLink, generateDifficultyBadge, generateDifficultyBadgeInverted } from "./badge"
import type { Quiz, QuizMetaInfo } from "./types"

export function getNearborREADME(quiz: Quiz, locale?: string) {
  return locale && locale !== defaultLocale && quiz.readme[locale]
    ? `./README.${locale}.md`
    : "./README.md"
}

function generateAuthorInfo(author: Partial<QuizMetaInfo["author"]> = {}) {
  return `By ${author.name}${author.github ? ` <a href="https://github.com/${author.github}" target="_blank">@${author.github}</a>` : ""}`
}

export function generateQuizREADME(quiz: Quiz, locale?: string, absolute = false) {
  const prefix = absolute ? `${REPO}/blob/master` : "."
  return locale && locale !== defaultLocale && quiz.readme[locale]
    ? `${prefix}/questions/${quiz.path}/README.${locale}.md`
    : `${prefix}/questions/${quiz.path}/README.md`
}

function quizToBadge(quiz: Quiz, locale: string, absolute = false) {
  const info = resolveInfo(quiz, locale)

  return generateBadgeLink(
    generateQuizREADME(quiz, locale, absolute),
    "",
    `${quiz.no}・${quiz.info![locale]?.title || quiz.info![defaultLocale]?.title}`,
    DIFFICULTY_COLORS[info.difficulty],
  )
}

function getAllTags(quizes: Quiz[], locale: string) {
  const set = new Set<string>()
  for (const quiz of quizes) {
    const info = resolveInfo(quiz, locale)
    for (const tag of (info?.tags || []))
      set.add(tag as string)
  }
  return Array.from(set).sort()
}

function getQuizesByTag(quizes: Quiz[], locale: string, tag: string) {
  return quizes.filter((quiz) => {
    const info = resolveInfo(quiz, locale)
    return !!info.tags?.includes(tag)
  })
}

async function insertInfoToREADME(filepath: string, quiz: Quiz, locale: SupportedLocale) {
  if (!fs.existsSync(filepath))
    return
  const text = await fs.readFile(filepath, "utf-8")
  /* eslint-disable prefer-template */

  const info = resolveInfo(quiz, locale)
  const availableLocales = supportedLocales.filter(l => l !== locale).filter(l => !!quiz.readme[l])

  const fileContent = text
    .replace(
      /<!--info-header-start-->[\s\S]*<!--info-header-end-->/,
      "<!--info-header-start-->"
      + `<h1>${escapeHtml(info.title || "")} ${generateDifficultyBadge(info.difficulty, locale)} ${(info.tags || []).map(i => generateBadge("", `#${i}`, "999")).join(" ")}</h1>`
      + `<blockquote><p>${generateAuthorInfo(info.author)}</p></blockquote>`
      + "<p>"
      + generateBadgeLink(quiz.quizLink, "", t(locale, "badge.take-the-challenge"), "213547", "?logo=vue.js&logoColor=42b883")
      + (availableLocales.length ? ("&nbsp;&nbsp;&nbsp;" + availableLocales.map(l => generateBadgeLink(getNearborREADME(quiz, l), "", t(l, "display"), "gray")).join(" ")) : "")
      + "</p>"
      + "<!--info-header-end-->",
    )

  await fs.writeFile(filepath, fileContent, "utf-8")
}

export async function updateQuizREADME(quizes: Quiz[]) {
  // update each questions' readme
  for (const quiz of quizes) {
    for (const locale of supportedLocales) {
      await insertInfoToREADME(
        path.join(
          QUIZ_ROOT,
          quiz.path,
          f("README", locale, "md"),
        ),
        quiz,
        locale,
      )
    }
  }
}

export async function updateIndexREADME(quizes: Quiz[]) {
  // update index README
  for (const locale of supportedLocales) {
    const filepath = path.resolve(__dirname, "..", f("README", locale, "md"))

    let challengesREADME = ""
    let prev = ""

    // By Difficulty

    const quizesByDifficulty = [...quizes].sort((a, b) => {
      const preInfo = resolveInfo(a, locale)
      const activeInfo = resolveInfo(b, locale)
      return DIFFICULTY_RANK.indexOf(preInfo.difficulty!) - DIFFICULTY_RANK.indexOf(activeInfo.difficulty!)
    })

    for (const quiz of quizesByDifficulty) {
      const info = resolveInfo(quiz, locale)

      if (prev !== info!.difficulty!) {
        challengesREADME += `${prev ? "<br><br>" : ""}${generateDifficultyBadgeInverted(info!.difficulty!, locale, quizesByDifficulty.filter((q) => {
          const qInfo = resolveInfo(q, locale)
          return qInfo.difficulty === info!.difficulty
        }).length)}<br>`
      }

      challengesREADME += quizToBadge(quiz, locale)

      prev = info!.difficulty!
    }

    // By Tags

    challengesREADME += "<br><details><summary>By Tags</summary><br><table><tbody>"
    const tags = getAllTags(quizes, locale)
    for (const tag of tags) {
      challengesREADME += `<tr><td>${generateBadge("", `#${tag}`, "999")}</td><td>`
      getQuizesByTag(quizesByDifficulty, locale, tag)
        .forEach((quiz) => {
          challengesREADME += quizToBadge(quiz, locale)
        })
      challengesREADME += "</td></tr>"
    }
    challengesREADME += "<tr><td><code>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</code></td><td></td></tr>"
    challengesREADME += "</tbody></table></details>"

    let readme = await fs.readFile(filepath, "utf-8")
    readme = readme.replace(
      /<!--challenges-start-->[\s\S]*<!--challenges-end-->/m,
      `<!--challenges-start-->\n${challengesREADME}\n<!--challenges-end-->`,
    )
    await fs.writeFile(filepath, readme, "utf-8")
  }
}
