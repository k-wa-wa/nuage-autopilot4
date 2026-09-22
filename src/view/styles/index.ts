/**
 * Dashboard CSS Styles
 *
 * 各コンポーネント固有のスタイルはコンポーネントファイルの隣（同ディレクトリ）の
 * .css に co-locate してあり、ここではそれらを集約して1つの <style> にまとめるだけ。
 */

import bannerCss from "../components/Banner.css" with { type: "text" };
import cardCss from "../components/Card.css" with { type: "text" };
import chatPaneCss from "../components/chat/ChatPane.css" with { type: "text" };
import markdownBlocksCss from "../components/chat/markdownBlocks.css" with { type: "text" };
import errorModalCss from "../components/ErrorModal.css" with { type: "text" };
import historyModalCss from "../components/HistoryModal.css" with { type: "text" };
import infoModalCss from "../components/InfoModal.css" with { type: "text" };
import modalCss from "../components/Modal.css" with { type: "text" };
import relationConnectorsCss from "../components/RelationConnectors.css" with { type: "text" };
import systemErrorModalCss from "../components/SystemErrorModal.css" with { type: "text" };
import globalCss from "./global.css" with { type: "text" };

export const styles = [
  globalCss,
  cardCss,
  bannerCss,
  relationConnectorsCss,
  modalCss,
  infoModalCss,
  errorModalCss,
  historyModalCss,
  systemErrorModalCss,
  chatPaneCss,
  markdownBlocksCss,
].join("\n");
