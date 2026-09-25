---
name: 英文學習平台
description: 延續原有靛藍色彩的閱讀手帳與教材編輯工作台
colors:
  canvas: "#f4f5f7"
  surface: "#ffffff"
  surface-muted: "#f7f8fa"
  ink: "#1b2330"
  ink-soft: "#444e5c"
  ink-muted: "#667183"
  indigo: "#4f46e5"
  indigo-deep: "#4338ca"
  indigo-wash: "#eef2ff"
  line: "#e4e7ec"
  line-strong: "#cbd1dc"
  positive: "#0f8a5f"
  error: "#c0392b"
typography:
  display:
    fontFamily: 'Georgia, "Noto Serif TC", "Songti TC", serif'
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang TC", "Microsoft JhengHei", sans-serif'
    fontWeight: 400
    lineHeight: 1.6
  reading:
    fontFamily: 'Georgia, "Noto Serif TC", "Songti TC", serif'
    fontSize: "1.22rem"
    lineHeight: 1.86
rounded:
  sm: "8px"
  admin-button: "9px"
  card: "12px"
  panel: "18px"
  pill: "999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-learner-primary:
    backgroundColor: "{colors.indigo}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "11px 18px"
  button-learner-ghost:
    backgroundColor: "{colors.surface-muted}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "11px 18px"
  button-admin-primary:
    backgroundColor: "{colors.indigo}"
    textColor: "{colors.surface}"
    rounded: "{rounded.admin-button}"
    padding: "11px 18px"
---

# Design System: 英文學習平台

## Overview

**Creative North Star: "靛藍閱讀室與編輯工作台"**

前台像一本持續使用的閱讀手帳：課文封面與原文是主角，篩選、播放與查字服務閱讀節奏。後台像整理教材的工作台：密度較高，但操作區、狀態與資料列清楚分組。兩端延續原有靛藍、淡藍灰與白色的色彩印象，並共用文字與控制元件語言。

**Key Characteristics:**

- 淡藍灰背景、白色內容面與靛藍操作色，讓長時間閱讀保持清晰。
- 標題與文章使用襯線字，介面控制使用清楚的無襯線字。
- 以細邊框與留白建立層級，陰影只出現在需要浮起的物件。
- 手機版保留完整操作，不把關鍵動作藏在水平溢出之外。

## Colors

主色為靛藍 `#4f46e5`，用於主要按鈕、目前選項及焦點內容；主要文字為 `#1b2330`。背景 `#f4f5f7`、白色卡面 `#ffffff`、次表面 `#f7f8fa` 與邊線 `#e4e7ec` 形成層次。成功使用 `#0f8a5f`，錯誤使用 `#c0392b`。

**The Quiet Accent Rule.** 靛藍標出當前狀態與主要動作；大量教材內容保持白色與深色文字。

## Typography

標題與英文閱讀文字使用 Georgia、Noto Serif TC、Songti TC 字型堆疊。控制元件與繁中說明使用系統無襯線、PingFang TC、Microsoft JhengHei。閱讀文字為 `1.22rem / 1.86`；數據與進度使用等寬數字。保留明確的標題、內文與輔助資訊層級。

## Layout

學習清單最多約 1080px、文章閱讀約 860px；後台工作區最多 1240px。清單在寬螢幕以兩欄呈現，窄螢幕改單欄；後台的文章列表在手機上改成逐筆排列，操作與狀態仍可直接看見。表單控制在窄螢幕換行，避免頁面整體水平捲動。

## Elevation & Depth

一般面板以色面與 1px 邊線區隔。懸停卡片與彈窗使用柔和、有位移的陰影；固定播放器因覆蓋閱讀內容而使用較明顯的分層。沒有裝飾性光暈。

## Shapes

前台一般按鈕為膠囊圓角，後台按鈕為 9px 圓角；表單欄位約 8px、卡片約 12–18px。封面圖片依容器裁切，避免因來源比例不同造成清單跳動。狀態徽章與篩選籤可使用較圓的形狀，但不取代文字標籤。

## Components

主要按鈕為靛藍實色；前台次要按鈕使用次表面，後台次要按鈕使用卡面與邊線。篩選與輸入框維持明顯邊界；一般鍵盤焦點以靛藍外框表示，部分表單欄位使用靛藍邊線與淡藍光圈。文章卡片先呈現封面，再呈現標題與 metadata。複習卡把目前單字、來源原文、解釋與熟悉操作依學習順序排列。管理表格以標題、狀態、操作三層掃讀。

## Do's and Don'ts

- Do：讓教材文字與圖片優先於裝飾。
- Do：在手機版直接露出主要動作與狀態。
- Do：為無圖、載入中、錯誤及停用狀態保留清楚表現。
- Don't：用背景色代替足夠的文字對比。
- Don't：在閱讀區堆疊多層卡片或與內容無關的視覺效果。
