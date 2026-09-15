import React, { useState, useEffect, useRef } from 'react';
import { Smile, Coffee, Activity, Cloud, Zap, Heart, Flag, Clock, Moon, Lightbulb, ArrowLeft, Bird } from 'lucide-react';

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

const ICONS = [
  { category: 'GESTURES & SMILEYS', items: ['👍', '👎', '✌️', '🤞', '✊', '🖐️', '👤', '☺', '☹'] },
  { category: 'SYMBOLS & FLAGS', items: ['🚩', '🏁', '🏴', '❤️', '⭐', '✨', '☑', '✔', '✖', '⏻', '↻', '🎯', '📍', '➕', '➖', '❓', '❗', '👁', '💬'] },
  { category: 'NATURE', items: ['🍃', '☀', '☾', '🐞', '⚡'] },
  { category: 'CURRENCY', items: ['€', '£', '$', '₹', '¥', '₽', '₿'] },
  { category: 'OBJECTS', items: ['🔍', '🏠', '⌚', '📷', '⚙', '💧', '🎁'] }
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
}

export function EmojiGridPicker({ onSelect }: EmojiPickerProps) {
  const [activeTab, setActiveTab] = useState('Emojis');
  const [activeEmojiNav, setActiveEmojiNav] = useState('recent');
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [recentlyUsed, setRecentlyUsed] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('tv_recent_emojis');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {}
      }
    }
    return ['✔️', '👁️', '🔥', '🚀'];
  });

  const handleSelect = (emoji: string) => {
    setRecentlyUsed(prev => {
      const next = [emoji, ...prev.filter(e => e !== emoji)].slice(0, 8);
      localStorage.setItem('tv_recent_emojis', JSON.stringify(next));
      return next;
    });
    onSelect(emoji);
  };

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const sections = container.querySelectorAll('[data-category]');
    
    let current = 'recent';
    sections.forEach((section) => {
      const rect = section.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      // If the section top is above or near the top of the container
      if (rect.top <= containerRect.top + 30) {
        current = section.getAttribute('data-category') || 'recent';
      }
    });
    
    // If we're at the very top, always select recent
    if (container.scrollTop === 0) {
      current = 'recent';
    }
    
    setActiveEmojiNav(current);
  };

  const handleScrollTo = (category: string) => {
    setActiveEmojiNav(category);
    if (!scrollContainerRef.current) return;
    const element = scrollContainerRef.current.querySelector(`[data-category="${category}"]`);
    if (element) {
      // scroll to the element smoothly
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const renderTopNav = () => {
    if (activeTab === 'Icons') {
      return (
        <div style={{ display: 'flex', padding: '8px 12px', borderBottom: '1px solid var(--tv-color-border, #e0e3eb)', gap: '16px' }}>
          {[
            { icon: <Smile size={18} strokeWidth={1.5} />, active: true },
            { icon: <Flag size={18} strokeWidth={1.5} />, active: false },
            { icon: <Moon size={18} strokeWidth={1.5} />, active: false },
            { icon: <Activity size={18} strokeWidth={1.5} />, active: false },
            { icon: <Lightbulb size={18} strokeWidth={1.5} />, active: false },
            { icon: <ArrowLeft size={18} strokeWidth={1.5} />, active: false },
          ].map((tab, i) => (
            <div 
              key={i} 
              style={{ 
                color: tab.active ? '#2962ff' : 'var(--tv-color-text-muted, #787b86)',
                borderBottom: tab.active ? '2px solid #2962ff' : '2px solid transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '-9px',
                padding: '4px 4px 10px 4px'
              }}
            >
              {tab.icon}
            </div>
          ))}
        </div>
      );
    }

    if (activeTab === 'Stickers') {
      return (
        <div style={{ padding: '12px 16px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--tv-color-text-muted, #787b86)', letterSpacing: '0.5px', textTransform: 'uppercase', borderBottom: '1px solid var(--tv-color-border, #e0e3eb)' }}>
          TradingView
        </div>
      );
    }

    // Default Emojis top nav
    return (
      <div style={{ display: 'flex', padding: '8px 12px', borderBottom: '1px solid var(--tv-color-border, #e0e3eb)', justifyContent: 'space-between' }}>
        {[
          { id: 'recent', icon: <Clock size={18} strokeWidth={1.5} /> },
          { id: 'Smiles & People', icon: <Smile size={18} strokeWidth={1.5} /> },
          { id: 'Animals & Nature', icon: <Bird size={18} strokeWidth={1.5} /> },
          { id: 'Food & Drink', icon: <Coffee size={18} strokeWidth={1.5} /> },
          { id: 'Activity', icon: <Activity size={18} strokeWidth={1.5} /> },
          { id: 'Travel & Places', icon: <Cloud size={18} strokeWidth={1.5} /> },
          { id: 'Objects', icon: <Lightbulb size={18} strokeWidth={1.5} /> },
          { id: 'Symbols', icon: <Heart size={18} strokeWidth={1.5} /> },
          { id: 'Flags', icon: <Flag size={18} strokeWidth={1.5} /> },
        ].map((tab, i) => {
          const isActive = activeEmojiNav === tab.id;
          return (
            <div 
              key={i} 
              onClick={() => handleScrollTo(tab.id)}
              style={{ 
                color: isActive ? '#2962ff' : 'var(--tv-color-text-muted, #787b86)',
                borderBottom: isActive ? '2px solid #2962ff' : '2px solid transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '-9px',
                padding: '4px 4px 10px 4px'
              }}
            >
              {tab.icon}
            </div>
          );
        })}
      </div>
    );
  };

  const renderBody = () => {
    if (activeTab === 'Stickers') {
      return (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(3, 1fr)', 
          gap: '12px', 
          padding: '16px',
          maxHeight: '280px',
          overflowY: 'auto'
        }}>
          {STICKERS.map((sticker, i) => (
            <button
              key={i}
              onClick={() => handleSelect(sticker.emoji)}
              style={{
                width: '100%',
                aspectRatio: '1',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                position: 'relative'
              }}
            >
              <div style={{
                width: '80%',
                height: '80%',
                borderRadius: '50%',
                backgroundColor: sticker.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '40px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                transition: 'transform 0.1s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                {sticker.emoji}
              </div>
              <div style={{
                marginTop: '4px',
                fontSize: '12px',
                fontWeight: 800,
                color: sticker.bg === '#2962ff' ? '#2962ff' : sticker.bg,
                textTransform: 'uppercase',
                textShadow: '1px 1px 0 #fff'
              }}>
                {sticker.label}
              </div>
            </button>
          ))}
        </div>
      );
    }

    if (activeTab === 'Icons') {
      return (
        <div style={{ maxHeight: '280px', overflowY: 'auto', paddingBottom: '12px' }}>
          {ICONS.map((section, idx) => (
            <div key={idx}>
              <div style={{ padding: '12px 16px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--tv-color-text-muted, #787b86)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                {section.category}
              </div>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(8, 1fr)', 
                gap: '4px', 
                padding: '0 12px'
              }}>
                {section.items.map((icon, i) => (
                  <button
                    key={i}
                    onClick={() => handleSelect(icon)}
                    style={{
                      width: '32px',
                      height: '32px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '18px',
                      color: 'var(--tv-color-text, #131722)',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '50%',
                      cursor: 'pointer',
                      fontFamily: 'sans-serif'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-color-item-hover-bg, #f0f3fa)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }

    // Default Emojis body
    return (
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        style={{ maxHeight: '280px', overflowY: 'auto' }}
      >
        {/* Header for Recently Used */}
        {recentlyUsed.length > 0 && (
          <div data-category="recent">
            <div style={{ padding: '12px 16px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--tv-color-text-muted, #787b86)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              Recently Used
            </div>
            <div style={{ 
              display: 'flex', 
              gap: '4px', 
              padding: '0 12px 12px',
              flexWrap: 'wrap'
            }}>
              {recentlyUsed.map((emoji, i) => (
                <button
                  key={i}
                  onClick={() => handleSelect(emoji)}
                  style={{
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '50%',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-color-item-hover-bg, #f0f3fa)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Categories */}
        {EMOJIS.map((section, idx) => (
          <div key={idx} data-category={section.category}>
            <div style={{ padding: '12px 16px 8px', fontSize: '11px', fontWeight: 600, color: 'var(--tv-color-text-muted, #787b86)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              {section.category}
            </div>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(8, 1fr)', 
              gap: '4px', 
              padding: '0 12px 12px'
            }}>
              {section.items.map((emoji, i) => (
                <button
                  key={i}
                  onClick={() => handleSelect(emoji)}
                  style={{
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '50%',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--tv-color-item-hover-bg, #f0f3fa)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div 
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: '100%',
        top: 0,
        marginLeft: '4px',
        backgroundColor: 'var(--tv-color-pane-background, #ffffff)',
        border: '1px solid var(--tv-color-border, #e0e3eb)',
        borderRadius: '6px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 100,
        width: '320px',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'sans-serif'
      }}
    >
      {renderTopNav()}
      {renderBody()}

      {/* Bottom Text Tab Bar */}
      <div style={{ display: 'flex', borderTop: '1px solid var(--tv-color-border, #e0e3eb)', padding: '0 16px' }}>
        {['Emojis', 'Stickers', 'Icons'].map((tab) => (
          <div 
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '12px 0',
              fontSize: '13px',
              color: activeTab === tab ? '#2962ff' : 'var(--tv-color-text, #131722)',
              borderBottom: activeTab === tab ? '2px solid #2962ff' : '2px solid transparent',
              cursor: 'pointer'
            }}
          >
            {tab}
          </div>
        ))}
      </div>
    </div>
  );
}
