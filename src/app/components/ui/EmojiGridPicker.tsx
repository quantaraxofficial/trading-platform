import React, { useState, useEffect, useRef } from 'react';
import { EmojiGlyph, IconGlyph } from './emojiArt';
import { ICON_SECTIONS } from './iconData';

const EMOJIS = [
  {
    category: 'Smiles & People',
    items: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣',
      '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰',
      '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜',
      '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏',
      '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣',
      '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠',
      '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨',
      '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥',
      '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧',
      '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐',
      '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑'
    ]
  },
  {
    category: 'Animals & Nature',
    items: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨',
      '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉', '🙊',
      '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉',
      '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞',
      '🐜', '🦟', '🦗', '🕷', '🕸', '🦂', '🐢', '🐍', '🦎', '🦖',
      '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', '🐬',
      '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🐘',
      '🦛', '🦏', '🐪', '🐫', '🦒', '🦘', '🐃', '🐂', '🐄', '🐎',
      '🐖', '🐏', '🐑', '🦙', '🐐', '🦌', '🐕', '🐩', '🦮', '🐕‍🦺',
      '🐈', '🐓', '🦃', '🦚', '🦜', '🦢', '🦩', '🕊', '🐇', '🦝',
      '🦨', '🦡', '🦦', '🦥', '🐁', '🐀', '🐿', '🦔', '🐾', '🐉',
      '🐲', '🌵', '🎄', '🌲', '🌳', '🌴', '🌱', '🌿', '☘', '🍀',
      '🎍', '🎋', '🍃', '🍂', '🍁', '🍄', '🐚', '🌾', '💐', '🌷',
      '🌹', '🥀', '🌺', '🌸', '🌼', '🌻', '🌞', '🌝', '🌛', '🌜',
      '🌚', '🌕', '🌖', '🌗', '🌘', '🌑', '🌒', '🌓', '🌔', '🌙',
      '🌎', '🌍', '🌏', '🪐', '💫', '⭐', '🌟', '✨', '⚡', '☄',
      '💥', '🔥', '🌪', '🌈', '☀', '🌤', '⛅', '🌥', '☁', '🌦',
      '🌧', '⛈', '🌩', '🌨', '❄', '☃', '⛄', '🌬', '💨', '💧',
      '💦', '☔', '🌊', '🌫'
    ]
  },
  {
    category: 'Food & Drink',
    items: [
      '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓',
      '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆',
      '🥑', '🥦', '🥬', '🥒', '🌶', '🌽', '🥕', '🧄', '🧅',
      '🥔', '🍠', '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚',
      '🍳', '🧈', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🌭',
      '🍔', '🍟', '🍕', '🥪', '🥙', '🧆', '🌮', '🌯', '🥗',
      '🥘', '🥫', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟',
      '🦪', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🥮', '🍢',
      '🍡', '🍧', '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮',
      '🍭', '🍬', '🍫', '🍿', '🍩', '🍪', '🌰', '🥜', '🍯',
      '🥛', '🍼', '☕', '🍵', '🧃', '🥤', '🍶', '🍺', '🍻',
      '🥂', '🍷', '🥃', '🍸', '🍹', '🧉', '🍾', '🧊', '🥄',
      '🍴', '🍽', '🥣', '🥡', '🥢', '🧂'
    ]
  },
  {
    category: 'Activity',
    items: [
      '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏',
      '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🥅',
      '⛳', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹',
      '🛷', '⛸', '🥌', '🎿', '⛷', '🏂', '🪂', '🏋️', '🏋️‍♀️',
      '🤼', '🤼‍♂️', '🤼‍♀️', '🤸', '🤸‍♂️', '🤸‍♀️', '⛹️', '⛹️‍♂️', '⛹️‍♀️',
      '🤺', '🤾', '🤾‍♂️', '🤾‍♀️', '🏌️', '🏌️‍♂️', '🏌️‍♀️', '🏇', '🧘',
      '🧘‍♂️', '🧘‍♀️', '🏄', '🏄‍♂️', '🏄‍♀️', '🏊', '🏊‍♂️', '🏊‍♀️', '🤽',
      '🤽‍♂️', '🤽‍♀️', '🚣', '🚣‍♂️', '🚣‍♀️', '🧗', '🧗‍♂️', '🧗‍♀️', '🚵',
      '🚵‍♂️', '🚵‍♀️', '🚴', '🚴‍♂️', '🚴‍♀️', '🏆', '🥇', '🥈', '🥉',
      '🏅', '🎖', '🏵', '🎗', '🎫', '🎟', '🎪', '🤹', '🤹‍♂️',
      '🤹‍♀️', '🎭', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁',
      '🎷', '🎺', '🎸', '🪕', '🎻', '🎲', '🎯', '🎳', '🎮',
      '🎰', '🧩'
    ]
  },
  {
    category: 'Travel & Places',
    items: [
      '🚗', '🚕', '🚙', '🚌', '🚎', '🏎', '🚓', '🚑', '🚒',
      '🚐', '🚚', '🚛', '🚜', '🦯', '🦽', '🦼', '🛴', '🚲',
      '🛵', '🏍', '🛺', '🚨', '🚔', '🚍', '🚘', '🚖', '🚡',
      '🚠', '🚟', '🚃', '🚋', '🚞', '🚝', '🚄', '🚅', '🚈',
      '🚂', '🚆', '🚇', '🚊', '🚉', '✈', '🛫', '🛬', '🛩',
      '💺', '🛰', '🚀', '🛸', '🚁', '🛶', '⛵', '🚤', '🛥',
      '🛳', '⛴', '🚢', '⚓', '⛽', '🚧', '🚦', '🚥', '🚏',
      '🗺', '🗿', '🗽', '🗼', '🏰', '🏯', '🏟', '🎡', '🎢',
      '🎠', '⛲', '⛱', '🏖', '🏝', '🏜', '🌋', '⛰', '🏔',
      '🗻', '🏕', '⛺', '🏠', '🏡', '🏘', '🏚', '🏗', '🏭',
      '🏢', '🏬', '🏣', '🏤', '🏥', '🏦', '🏨', '🏪', '🏫',
      '🏩', '💒', '🏛', '⛪', '🕌', '🕍', '🛕', '🕋', '⛩',
      '🛤', '🛣', '🗾', '🎑', '🏞', '🌅', '🌄', '🌠', '🎇',
      '🎆', '🌇', '🌆', '🏙', '🌃', '🌌', '🌉', '🌁'
    ]
  },
  {
    category: 'Objects',
    items: [
      '⌚', '📱', '📲', '💻', '⌨', '🖥', '🖨', '🖱', '🖲',
      '🕹', '🗜', '💽', '💾', '💿', '📀', '📼', '📷', '📸',
      '📹', '🎥', '📽', '🎞', '📞', '☎', '📟', '📠', '📺',
      '📻', '🎙', '🎚', '🎛', '🧭', '⏱', '⏲', '⏰', '🕰',
      '⌛', '⏳', '📡', '🔋', '🔌', '💡', '🔦', '🕯', '🪔',
      '🧯', '🛢', '💸', '💵', '💴', '💶', '💷', '💰', '💳',
      '💎', '⚖', '🧰', '🔧', '🔨', '⚒', '🛠', '⛏', '🔩',
      '⚙', '🧱', '⛓', '🧲', '🔫', '💣', '🧨', '🪓', '🔪',
      '🗡', '⚔', '🛡', '🚬', '⚰', '⚱', '🏺', '🔮', '📿',
      '🧿', '💈', '⚗', '🔭', '🔬', '🕳', '🩹', '🩺', '💊',
      '💉', '🧬', '🦠', '🧫', '🧪', '🌡', '🧹', '🧺', '🧻',
      '🚽', '🚰', '🚿', '🛁', '🛀', '🧼', '🪒', '🧽', '🧴',
      '🛎', '🔑', '🗝', '🚪', '🪑', '🛋', '🛏', '🛌', '🧸',
      '🖼', '🛍', '🛒', '🎁', '🎈', '🎏', '🎀', '🎊', '🎉',
      '🎎', '🏮', '🎐', '🧧', '✉', '📩', '📨', '📧', '💌',
      '📥', '📤', '📦', '🏷', '📪', '📫', '📬', '📭', '📮',
      '📯', '📜', '📃', '📄', '📑', '🧾', '📊', '📈', '📉',
      '🗒', '🗓', '📆', '📅', '🗑', '📇', '🗃', '🗳', '🗄',
      '📋', '📁', '📂', '🗂', '🗞', '📰', '📓', '📕', '📗',
      '📘', '📙', '📚', '📖', '🔖', '🧷', '🔗', '📎', '🖇',
      '📐', '📏', '🧮', '📌', '📍', '✂', '🖊', '🖋', '✒',
      '🖌', '🖍', '📝', '✏', '🔍', '🔎', '🔏', '🔐', '🔒',
      '🔓', '🧳', '☂', '☔', '🧵', '🧶', '👓', '🕶', '🥽',
      '🥼', '🦺', '👔', '👕', '👖', '🧣', '🧤', '🧥', '🧦',
      '👗', '👘', '🥻', '🩱', '🩲', '🩳', '👙', '👚', '👛',
      '👜', '👝', '🎒', '👞', '👟', '🥾', '🥿', '👠', '👡',
      '🩰', '👢', '👑', '👒', '🎩', '🎓', '🧢', '⛑', '💄',
      '💍', '💼'
    ]
  },
  {
    category: 'Symbols',
    items: [
      '❤', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎',
      '💔', '❣', '💕', '💞', '💓', '💗', '💖', '💘', '💝',
      '💟', '☮', '✝', '☪', '🕉', '☸', '✡', '🔯', '🕎',
      '☯', '☦', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌',
      '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛',
      '🉑', '☢', '☣', '📴', '📳', '🈶', '🈚', '🈸', '🈺',
      '🈷', '✴', '🆚', '💮', '🉐', '㊙', '㊗', '🈴', '🈵',
      '🈹', '🈲', '🅰', '🅱', '🆎', '🆑', '🅾', '🆘', '❌',
      '⭕', '🛑', '⛔', '📛', '🚫', '💯', '💢', '♨', '🚷',
      '🚯', '🚳', '🚱', '🔞', '📵', '🚭', '❗', '❕', '❓',
      '❔', '‼', '⁉', '🔅', '🔆', '〽', '⚠', '🚸', '🔱',
      '⚜', '🔰', '♻', '✅', '🈯', '💹', '❇', '✳', '❎',
      '🌐', '💠', 'Ⓜ', '🌀', '💤', '🏧', '🚾', '♿', '🅿',
      '🈳', '🈂', '🛂', '🛃', '🛄', '🛅', '🚹', '🚺', '🚼',
      '🚻', '🚮', '🎦', '📶', '🈁', '🔣', 'ℹ', '🔤', '🔡',
      '🔠', '🆖', '🆗', '🆙', '🆒', '🆕', '🆓', '0️⃣', '1️⃣',
      '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟',
      '🔢', '#️⃣', '*️⃣', '⏏', '▶', '⏸', '⏯', '⏹', '⏺',
      '⏭', '⏮', '⏩', '⏪', '⏫', '⏬', '◀', '🔼', '🔽',
      '➡', '⬅', '⬆', '⬇', '↗', '↘', '↙', '↖', '↕',
      '↔', '↪', '↩', '⤴', '⤵', '🔀', '🔁', '🔂', '🔄',
      '🔃', '🎵', '🎶', '➕', '➖', '➗', '✖', '♾', '💲',
      '💱', '™', '©', '®', '〰', '➰', '➿', '🔚', '🔙',
      '🔛', '🔝', '🔜', '✔️', '☑️', '🔘', '🔴', '🟠', '🟡',
      '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '🔺', '🔻', '🔸',
      '🔹', '🔶', '🔷', '🔳', '🔲', '▪', '▫', '◾', '◽',
      '◼', '◻', '🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '⬛',
      '⬜', '🟫', '🔈', '🔇', '🔉', '🔊', '🔔', '🔕', '📣',
      '📢', '👁‍🗨', '💬', '💭', '🗯', '♠', '♣', '♥', '♦',
      '🃏', '🎴', '🀄', '🕐', '🕑', '🕒', '🕓', '🕔', '🕕',
      '🕖', '🕗', '🕘', '🕙', '🕚', '🕛', '🕜', '🕝', '🕞',
      '🕟', '🕠', '🕡', '🕢', '🕣', '🕤', '🕥', '🕦', '🕧'
    ]
  },
  {
    category: 'Flags',
    items: [
      '🏳️', '🏴', '🏁', '🚩', '🏳️‍🌈', '🏴‍☠️', '🇦🇫', '🇦🇽', '🇦🇱',
      '🇩🇿', '🇦🇸', '🇦🇩', '🇦🇴', '🇦🇮', '🇦🇶', '🇦🇬', '🇦🇷', '🇦🇲',
      '🇦🇼', '🇦🇺', '🇦🇹', '🇦🇿', '🇧🇸', '🇧🇭', '🇧🇩', '🇧🇧', '🇧🇾',
      '🇧🇪', '🇧🇿', '🇧🇯', '🇧🇲', '🇧🇹', '🇧🇴', '🇧🇦', '🇧🇼', '🇧🇷',
      '🇮🇴', '🇻🇬', '🇧🇳', '🇧🇬', '🇧🇫', '🇧🇮', '🇰🇭', '🇨🇲', '🇨🇦',
      '🇮🇨', '🇨🇻', '🇧🇶', '🇰🇾', '🇨🇫', '🇹🇩', '🇨🇱', '🇨🇳', '🇨🇽',
      '🇨🇨', '🇨🇴', '🇰🇲', '🇨🇬', '🇨🇩', '🇨🇰', '🇨🇷', '🇨🇮', '🇭🇷',
      '🇨🇺', '🇨🇼', '🇨🇾', '🇨🇿', '🇩🇰', '🇩🇯', '🇩🇲', '🇩🇴', '🇪🇨',
      '🇪🇬', '🇸🇻', '🇬🇶', '🇪🇷', '🇪🇪', '🇪🇹', '🇪🇺', '🇫🇰', '🇫🇴',
      '🇫🇯', '🇫🇮', '🇫🇷', '🇬🇫', '🇵🇫', '🇹🇫', '🇬🇦', '🇬🇲', '🇬🇪',
      '🇩🇪', '🇬🇭', '🇬🇮', '🇬🇷', '🇬🇱', '🇬🇩', '🇬🇵', '🇬🇺', '🇬🇹',
      '🇬🇬', '🇬🇳', '🇬🇼', '🇬🇾', '🇭🇹', '🇭🇳', '🇭🇰', '🇭🇺', '🇮🇸',
      '🇮🇳', '🇮🇩', '🇮🇷', '🇮🇶', '🇮🇪', '🇮🇲', '🇮🇱', '🇮🇹', '🇯🇲',
      '🇯🇵', '🎌', '🇯🇪', '🇯🇴', '🇰🇿', '🇰🇪', '🇰🇮', '🇽🇰', '🇰🇼',
      '🇰🇬', '🇱🇦', '🇱🇻', '🇱🇧', '🇱🇸', '🇱🇷', '🇱🇾', '🇱🇮', '🇱🇹',
      '🇱🇺', '🇲🇴', '🇲🇰', '🇲🇬', '🇲🇼', '🇲🇾', '🇲🇻', '🇲🇱', '🇲🇹',
      '🇲🇭', '🇲🇶', '🇲🇷', '🇲🇺', '🇾🇹', '🇲🇽', '🇫🇲', '🇲🇩', '🇲🇨',
      '🇲🇳', '🇲🇪', '🇲🇸', '🇲🇦', '🇲🇿', '🇲🇲', '🇳🇦', '🇳🇷', '🇳🇵',
      '🇳🇱', '🇳🇨', '🇳🇿', '🇳🇮', '🇳🇪', '🇳🇬', '🇳🇺', '🇳🇫', '🇰🇵',
      '🇲🇵', '🇳🇴', '🇴🇲', '🇵🇰', '🇵🇼', '🇵🇸', '🇵🇦', '🇵🇬', '🇵🇾',
      '🇵🇪', '🇵🇭', '🇵🇳', '🇵🇱', '🇵🇹', '🇵🇷', '🇶🇦', '🇷🇪', '🇷🇴',
      '🇷🇺', '🇷🇼', '🇼🇸', '🇸🇲', '🇸🇦', '🇸🇳', '🇷🇸', '🇸🇨', '🇸🇱',
      '🇸🇬', '🇸🇽', '🇸🇰', '🇸🇮', '🇸🇧', '🇸🇴', '🇿🇦', '🇰🇷', '🇸🇸',
      '🇪🇸', '🇱🇰', '🇧🇱', '🇸🇭', '🇰🇳', '🇱🇨', '🇲🇫', '🇵🇲', '🇻🇨',
      '🇸🇩', '🇸🇷', '🇸🇯', '🇸🇿', '🇸🇪', '🇨🇭', '🇸🇾', '🇹🇼', '🇹🇯',
      '🇹🇿', '🇹🇭', '🇹🇱', '🇹🇬', '🇹🇰', '🇹🇴', '🇹🇹', '🇹🇳', '🇹🇷',
      '🇹🇲', '🇹🇨', '🇹🇻', '🇻🇮', '🇺🇬', '🇺🇦', '🇦🇪', '🇬🇧', '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
      '🏴󠁧󠁢󠁳󠁣󠁴󠁿', '🏴󠁧󠁢󠁷󠁬󠁳󠁿', '🇺🇳', '🇺🇸', '🇺🇾', '🇺🇿', '🇻🇺', '🇻🇦', '🇻🇪',
      '🇻🇳', '🇼🇫', '🇪🇭', '🇾🇪', '🇿🇲', '🇿🇼'
    ]
  }
];

const STICKERS = [
  { emoji: '🚀', bg: '#2962ff', label: 'Moon' },
  { emoji: '₿', bg: '#2962ff', label: 'Bitcoin' },
  { emoji: '🐕', bg: '#ff9800', label: 'Doge' },
  { emoji: '💀', bg: '#2962ff', label: 'Rekt' },
  { emoji: '🏆', bg: '#2962ff', label: 'Yolo' },
  { emoji: '🐳', bg: '#2962ff', label: 'Whale' },
  { emoji: '🦢', bg: '#2962ff', label: 'WAGMI' },
  { emoji: '🍗', bg: '#2962ff', label: 'Tendies' },
  { emoji: '⚖️', bg: '#2962ff', label: 'Short' },
  { emoji: '🐻', bg: '#ff5252', label: 'Rugged' },
  { emoji: '🐎', bg: '#2962ff', label: 'Shill' },
  { emoji: '🛶', bg: '#2962ff', label: 'Boat' },
  { emoji: '🚫', bg: '#2962ff', label: 'Sell' },
  { emoji: '💎', bg: '#2962ff', label: 'Hold' },
  { emoji: '🦄', bg: '#2962ff', label: 'OG' },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  // Lets the toolbar that opens it position the picker (e.g. fixed beside its button)
  popupRef?: (el: HTMLDivElement | null) => void;
}

// TradingView's measurements: a 353px panel, 46px category bar with a 3px underline on the
// active tab, uppercase section headers, 9 emojis per row at a 37.6px pitch, and the
// Emojis / Stickers / Icons tabs centred at the bottom
const CELL = 37.6;
const NAV_TAB = 38;
const muted = 'var(--tv-color-text-muted, #787b86)';
const text = 'var(--tv-color-text, #131722)';
const border = 'var(--tv-color-border, #e0e3eb)';
const hoverBg = 'var(--tv-color-item-hover-bg, #f0f3fa)';
const RECENT_KEY = 'tv_recent_emojis';

const EMOJI_NAV: { id: string; icon: string }[] = [
  { id: 'recent', icon: 'icon:r:clock' },
  { id: 'Smiles & People', icon: 'icon:r:face-smile' },
  { id: 'Animals & Nature', icon: 'icon:s:leaf' },
  { id: 'Food & Drink', icon: 'icon:s:gift' },
  { id: 'Activity', icon: 'icon:s:bullseye' },
  { id: 'Travel & Places', icon: 'icon:s:rocket' },
  { id: 'Objects', icon: 'icon:s:lightbulb' },
  { id: 'Symbols', icon: 'icon:r:heart' },
  { id: 'Flags', icon: 'icon:r:flag' },
];

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: '14px 0 6px 17px', fontSize: 11, fontWeight: 600, color: muted, letterSpacing: '0.4px', textTransform: 'uppercase' }}>
      {children}
    </div>
  );
}

function Cell({ onPick, title, children }: { onPick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onPick}
      style={{ width: CELL, height: CELL, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', padding: 0, color: text }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = hoverBg)}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      {children}
    </button>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(9, ${CELL}px)`, padding: '0 5px 4px' }}>{children}</div>;
}

// The top category bar: icons at a 38px pitch, the active one underlined
function NavBar({ tabs, active, onPick }: { tabs: { id: string; icon: string }[]; active: string; onPick: (id: string) => void }) {
  return (
    <div style={{ display: 'flex', height: 46, padding: '0 5px', borderBottom: `1px solid ${border}`, flex: 'none' }}>
      {tabs.map(t => {
        const on = active === t.id;
        return (
          <button key={t.id} type="button" onClick={() => onPick(t.id)} aria-label={t.id}
            style={{ width: NAV_TAB, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', position: 'relative', color: on ? text : muted, padding: 0 }}>
            <IconGlyph id={t.icon} size={20} />
            {on && <span style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 3, background: '#2962ff', borderRadius: '3px 3px 0 0' }} />}
          </button>
        );
      })}
    </div>
  );
}

export function EmojiGridPicker({ onSelect, popupRef }: EmojiPickerProps) {
  const [activeTab, setActiveTab] = useState<'Emojis' | 'Stickers' | 'Icons'>('Emojis');
  const [activeNav, setActiveNav] = useState('recent');
  const scrollRef = useRef<HTMLDivElement>(null);

  const [recentlyUsed, setRecentlyUsed] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter((e: unknown) => typeof e === 'string'); } catch { return []; }
  });

  const pick = (value: string) => {
    if (activeTab === 'Emojis') {
      setRecentlyUsed(prev => {
        const next = [value, ...prev.filter(e => e !== value)].slice(0, 18);
        try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
        return next;
      });
    }
    onSelect(value);
  };

  // Scrolling the body moves the category bar's underline to the section at the top
  const onScroll = () => {
    const box = scrollRef.current;
    if (!box) return;
    const top = box.getBoundingClientRect().top;
    let current = activeTab === 'Emojis' ? 'recent' : ICON_SECTIONS[0].category;
    box.querySelectorAll<HTMLElement>('[data-category]').forEach(sec => {
      if (sec.getBoundingClientRect().top <= top + 30) current = sec.dataset.category || current;
    });
    setActiveNav(current);
  };
  const scrollTo = (id: string) => {
    setActiveNav(id);
    scrollRef.current?.querySelector(`[data-category="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'start' });
  };
  useEffect(() => {
    setActiveNav(activeTab === 'Icons' ? ICON_SECTIONS[0].category : 'recent');
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [activeTab]);

  let nav: React.ReactNode = null;
  let body: React.ReactNode;
  if (activeTab === 'Emojis') {
    nav = <NavBar tabs={EMOJI_NAV} active={activeNav} onPick={scrollTo} />;
    body = (
      <>
        <div data-category="recent">
          <SectionHeader>Recently used</SectionHeader>
          {recentlyUsed.length > 0 ? (
            <Grid>{recentlyUsed.map(e => <Cell key={e} onPick={() => pick(e)}><EmojiGlyph char={e} size={24} /></Cell>)}</Grid>
          ) : (
            <div style={{ padding: '2px 17px 8px', fontSize: 13, color: muted }}>Emojis you add to the chart show up here</div>
          )}
        </div>
        {EMOJIS.map(sec => (
          <div key={sec.category} data-category={sec.category}>
            <SectionHeader>{sec.category}</SectionHeader>
            <Grid>{sec.items.map((e, i) => <Cell key={i} onPick={() => pick(e)}><EmojiGlyph char={e} size={24} /></Cell>)}</Grid>
          </div>
        ))}
      </>
    );
  } else if (activeTab === 'Icons') {
    nav = <NavBar tabs={ICON_SECTIONS.map(s => ({ id: s.category, icon: s.nav }))} active={activeNav} onPick={scrollTo} />;
    body = ICON_SECTIONS.map(sec => (
      <div key={sec.category} data-category={sec.category}>
        <SectionHeader>{sec.category}</SectionHeader>
        <Grid>{sec.items.map(id => <Cell key={id} onPick={() => pick(id)}><IconGlyph id={id} size={20} /></Cell>)}</Grid>
      </div>
    ));
  } else {
    nav = (
      <div style={{ display: 'flex', height: 46, padding: '0 5px', borderBottom: `1px solid ${border}`, flex: 'none' }}>
        <span style={{ width: NAV_TAB, height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
          <EmojiGlyph char="🚀" size={22} />
          <span style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 3, background: '#2962ff', borderRadius: '3px 3px 0 0' }} />
        </span>
      </div>
    );
    body = (
      <div>
        <SectionHeader>Stickers</SectionHeader>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '0 12px 12px' }}>
          {STICKERS.map(st => (
            <button key={st.label} type="button" onClick={() => pick(st.emoji)} title={st.label}
              style={{ aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = hoverBg)}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
              <span style={{ width: 64, height: 64, borderRadius: '50%', background: st.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <EmojiGlyph char={st.emoji} size={40} />
              </span>
              <span style={{ fontSize: 12, fontWeight: 800, color: st.bg, textTransform: 'uppercase' }}>{st.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={popupRef}
      onClick={e => e.stopPropagation()}
      style={{
        position: 'absolute', left: '100%', top: 0, marginLeft: 4, width: 353, height: 676, maxHeight: 'calc(100vh - 120px)',
        background: 'var(--tv-color-pane-background, #ffffff)', borderRadius: 6, boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
        zIndex: 100, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
    >
      {nav}
      <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {body}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 26, height: 48, borderTop: `1px solid ${border}`, flex: 'none' }}>
        {(['Emojis', 'Stickers', 'Icons'] as const).map(tab => {
          const on = activeTab === tab;
          return (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)}
              style={{ position: 'relative', height: 48, padding: '0 2px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 15, color: on ? '#2962ff' : text }}>
              {tab}
              {on && <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: '#2962ff', borderRadius: '3px 3px 0 0' }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
