"use strict";

// http://hgm.nubati.net/book_format.html

const PolyglotPieceXorVals = BigUint64Array.from([
	BigInt("0x9d39247e33776d41"), BigInt("0x2af7398005aaa5c7"), BigInt("0x44db015024623547"), BigInt("0x9c15f73e62a76ae2"),
	BigInt("0x75834465489c0c89"), BigInt("0x3290ac3a203001bf"), BigInt("0x0fbbad1f61042279"), BigInt("0xe83a908ff2fb60ca"),
	BigInt("0x0d7e765d58755c10"), BigInt("0x1a083822ceafe02d"), BigInt("0x9605d5f0e25ec3b0"), BigInt("0xd021ff5cd13a2ed5"),
	BigInt("0x40bdf15d4a672e32"), BigInt("0x011355146fd56395"), BigInt("0x5db4832046f3d9e5"), BigInt("0x239f8b2d7ff719cc"),
	BigInt("0x05d1a1ae85b49aa1"), BigInt("0x679f848f6e8fc971"), BigInt("0x7449bbff801fed0b"), BigInt("0x7d11cdb1c3b7adf0"),
	BigInt("0x82c7709e781eb7cc"), BigInt("0xf3218f1c9510786c"), BigInt("0x331478f3af51bbe6"), BigInt("0x4bb38de5e7219443"),
	BigInt("0xaa649c6ebcfd50fc"), BigInt("0x8dbd98a352afd40b"), BigInt("0x87d2074b81d79217"), BigInt("0x19f3c751d3e92ae1"),
	BigInt("0xb4ab30f062b19abf"), BigInt("0x7b0500ac42047ac4"), BigInt("0xc9452ca81a09d85d"), BigInt("0x24aa6c514da27500"),
	BigInt("0x4c9f34427501b447"), BigInt("0x14a68fd73c910841"), BigInt("0xa71b9b83461cbd93"), BigInt("0x03488b95b0f1850f"),
	BigInt("0x637b2b34ff93c040"), BigInt("0x09d1bc9a3dd90a94"), BigInt("0x3575668334a1dd3b"), BigInt("0x735e2b97a4c45a23"),
	BigInt("0x18727070f1bd400b"), BigInt("0x1fcbacd259bf02e7"), BigInt("0xd310a7c2ce9b6555"), BigInt("0xbf983fe0fe5d8244"),
	BigInt("0x9f74d14f7454a824"), BigInt("0x51ebdc4ab9ba3035"), BigInt("0x5c82c505db9ab0fa"), BigInt("0xfcf7fe8a3430b241"),
	BigInt("0x3253a729b9ba3dde"), BigInt("0x8c74c368081b3075"), BigInt("0xb9bc6c87167c33e7"), BigInt("0x7ef48f2b83024e20"),
	BigInt("0x11d505d4c351bd7f"), BigInt("0x6568fca92c76a243"), BigInt("0x4de0b0f40f32a7b8"), BigInt("0x96d693460cc37e5d"),
	BigInt("0x42e240cb63689f2f"), BigInt("0x6d2bdcdae2919661"), BigInt("0x42880b0236e4d951"), BigInt("0x5f0f4a5898171bb6"),
	BigInt("0x39f890f579f92f88"), BigInt("0x93c5b5f47356388b"), BigInt("0x63dc359d8d231b78"), BigInt("0xec16ca8aea98ad76"),
	BigInt("0x5355f900c2a82dc7"), BigInt("0x07fb9f855a997142"), BigInt("0x5093417aa8a7ed5e"), BigInt("0x7bcbc38da25a7f3c"),
	BigInt("0x19fc8a768cf4b6d4"), BigInt("0x637a7780decfc0d9"), BigInt("0x8249a47aee0e41f7"), BigInt("0x79ad695501e7d1e8"),
	BigInt("0x14acbaf4777d5776"), BigInt("0xf145b6beccdea195"), BigInt("0xdabf2ac8201752fc"), BigInt("0x24c3c94df9c8d3f6"),
	BigInt("0xbb6e2924f03912ea"), BigInt("0x0ce26c0b95c980d9"), BigInt("0xa49cd132bfbf7cc4"), BigInt("0xe99d662af4243939"),
	BigInt("0x27e6ad7891165c3f"), BigInt("0x8535f040b9744ff1"), BigInt("0x54b3f4fa5f40d873"), BigInt("0x72b12c32127fed2b"),
	BigInt("0xee954d3c7b411f47"), BigInt("0x9a85ac909a24eaa1"), BigInt("0x70ac4cd9f04f21f5"), BigInt("0xf9b89d3e99a075c2"),
	BigInt("0x87b3e2b2b5c907b1"), BigInt("0xa366e5b8c54f48b8"), BigInt("0xae4a9346cc3f7cf2"), BigInt("0x1920c04d47267bbd"),
	BigInt("0x87bf02c6b49e2ae9"), BigInt("0x092237ac237f3859"), BigInt("0xff07f64ef8ed14d0"), BigInt("0x8de8dca9f03cc54e"),
	BigInt("0x9c1633264db49c89"), BigInt("0xb3f22c3d0b0b38ed"), BigInt("0x390e5fb44d01144b"), BigInt("0x5bfea5b4712768e9"),
	BigInt("0x1e1032911fa78984"), BigInt("0x9a74acb964e78cb3"), BigInt("0x4f80f7a035dafb04"), BigInt("0x6304d09a0b3738c4"),
	BigInt("0x2171e64683023a08"), BigInt("0x5b9b63eb9ceff80c"), BigInt("0x506aacf489889342"), BigInt("0x1881afc9a3a701d6"),
	BigInt("0x6503080440750644"), BigInt("0xdfd395339cdbf4a7"), BigInt("0xef927dbcf00c20f2"), BigInt("0x7b32f7d1e03680ec"),
	BigInt("0xb9fd7620e7316243"), BigInt("0x05a7e8a57db91b77"), BigInt("0xb5889c6e15630a75"), BigInt("0x4a750a09ce9573f7"),
	BigInt("0xcf464cec899a2f8a"), BigInt("0xf538639ce705b824"), BigInt("0x3c79a0ff5580ef7f"), BigInt("0xede6c87f8477609d"),
	BigInt("0x799e81f05bc93f31"), BigInt("0x86536b8cf3428a8c"), BigInt("0x97d7374c60087b73"), BigInt("0xa246637cff328532"),
	BigInt("0x043fcae60cc0eba0"), BigInt("0x920e449535dd359e"), BigInt("0x70eb093b15b290cc"), BigInt("0x73a1921916591cbd"),
	BigInt("0x56436c9fe1a1aa8d"), BigInt("0xefac4b70633b8f81"), BigInt("0xbb215798d45df7af"), BigInt("0x45f20042f24f1768"),
	BigInt("0x930f80f4e8eb7462"), BigInt("0xff6712ffcfd75ea1"), BigInt("0xae623fd67468aa70"), BigInt("0xdd2c5bc84bc8d8fc"),
	BigInt("0x7eed120d54cf2dd9"), BigInt("0x22fe545401165f1c"), BigInt("0xc91800e98fb99929"), BigInt("0x808bd68e6ac10365"),
	BigInt("0xdec468145b7605f6"), BigInt("0x1bede3a3aef53302"), BigInt("0x43539603d6c55602"), BigInt("0xaa969b5c691ccb7a"),
	BigInt("0xa87832d392efee56"), BigInt("0x65942c7b3c7e11ae"), BigInt("0xded2d633cad004f6"), BigInt("0x21f08570f420e565"),
	BigInt("0xb415938d7da94e3c"), BigInt("0x91b859e59ecb6350"), BigInt("0x10cff333e0ed804a"), BigInt("0x28aed140be0bb7dd"),
	BigInt("0xc5cc1d89724fa456"), BigInt("0x5648f680f11a2741"), BigInt("0x2d255069f0b7dab3"), BigInt("0x9bc5a38ef729abd4"),
	BigInt("0xef2f054308f6a2bc"), BigInt("0xaf2042f5cc5c2858"), BigInt("0x480412bab7f5be2a"), BigInt("0xaef3af4a563dfe43"),
	BigInt("0x19afe59ae451497f"), BigInt("0x52593803dff1e840"), BigInt("0xf4f076e65f2ce6f0"), BigInt("0x11379625747d5af3"),
	BigInt("0xbce5d2248682c115"), BigInt("0x9da4243de836994f"), BigInt("0x066f70b33fe09017"), BigInt("0x4dc4de189b671a1c"),
	BigInt("0x51039ab7712457c3"), BigInt("0xc07a3f80c31fb4b4"), BigInt("0xb46ee9c5e64a6e7c"), BigInt("0xb3819a42abe61c87"),
	BigInt("0x21a007933a522a20"), BigInt("0x2df16f761598aa4f"), BigInt("0x763c4a1371b368fd"), BigInt("0xf793c46702e086a0"),
	BigInt("0xd7288e012aeb8d31"), BigInt("0xde336a2a4bc1c44b"), BigInt("0x0bf692b38d079f23"), BigInt("0x2c604a7a177326b3"),
	BigInt("0x4850e73e03eb6064"), BigInt("0xcfc447f1e53c8e1b"), BigInt("0xb05ca3f564268d99"), BigInt("0x9ae182c8bc9474e8"),
	BigInt("0xa4fc4bd4fc5558ca"), BigInt("0xe755178d58fc4e76"), BigInt("0x69b97db1a4c03dfe"), BigInt("0xf9b5b7c4acc67c96"),
	BigInt("0xfc6a82d64b8655fb"), BigInt("0x9c684cb6c4d24417"), BigInt("0x8ec97d2917456ed0"), BigInt("0x6703df9d2924e97e"),
	BigInt("0xc547f57e42a7444e"), BigInt("0x78e37644e7cad29e"), BigInt("0xfe9a44e9362f05fa"), BigInt("0x08bd35cc38336615"),
	BigInt("0x9315e5eb3a129ace"), BigInt("0x94061b871e04df75"), BigInt("0xdf1d9f9d784ba010"), BigInt("0x3bba57b68871b59d"),
	BigInt("0xd2b7adeeded1f73f"), BigInt("0xf7a255d83bc373f8"), BigInt("0xd7f4f2448c0ceb81"), BigInt("0xd95be88cd210ffa7"),
	BigInt("0x336f52f8ff4728e7"), BigInt("0xa74049dac312ac71"), BigInt("0xa2f61bb6e437fdb5"), BigInt("0x4f2a5cb07f6a35b3"),
	BigInt("0x87d380bda5bf7859"), BigInt("0x16b9f7e06c453a21"), BigInt("0x7ba2484c8a0fd54e"), BigInt("0xf3a678cad9a2e38c"),
	BigInt("0x39b0bf7dde437ba2"), BigInt("0xfcaf55c1bf8a4424"), BigInt("0x18fcf680573fa594"), BigInt("0x4c0563b89f495ac3"),
	BigInt("0x40e087931a00930d"), BigInt("0x8cffa9412eb642c1"), BigInt("0x68ca39053261169f"), BigInt("0x7a1ee967d27579e2"),
	BigInt("0x9d1d60e5076f5b6f"), BigInt("0x3810e399b6f65ba2"), BigInt("0x32095b6d4ab5f9b1"), BigInt("0x35cab62109dd038a"),
	BigInt("0xa90b24499fcfafb1"), BigInt("0x77a225a07cc2c6bd"), BigInt("0x513e5e634c70e331"), BigInt("0x4361c0ca3f692f12"),
	BigInt("0xd941aca44b20a45b"), BigInt("0x528f7c8602c5807b"), BigInt("0x52ab92beb9613989"), BigInt("0x9d1dfa2efc557f73"),
	BigInt("0x722ff175f572c348"), BigInt("0x1d1260a51107fe97"), BigInt("0x7a249a57ec0c9ba2"), BigInt("0x04208fe9e8f7f2d6"),
	BigInt("0x5a110c6058b920a0"), BigInt("0x0cd9a497658a5698"), BigInt("0x56fd23c8f9715a4c"), BigInt("0x284c847b9d887aae"),
	BigInt("0x04feabfbbdb619cb"), BigInt("0x742e1e651c60ba83"), BigInt("0x9a9632e65904ad3c"), BigInt("0x881b82a13b51b9e2"),
	BigInt("0x506e6744cd974924"), BigInt("0xb0183db56ffc6a79"), BigInt("0x0ed9b915c66ed37e"), BigInt("0x5e11e86d5873d484"),
	BigInt("0xf678647e3519ac6e"), BigInt("0x1b85d488d0f20cc5"), BigInt("0xdab9fe6525d89021"), BigInt("0x0d151d86adb73615"),
	BigInt("0xa865a54edcc0f019"), BigInt("0x93c42566aef98ffb"), BigInt("0x99e7afeabe000731"), BigInt("0x48cbff086ddf285a"),
	BigInt("0x7f9b6af1ebf78baf"), BigInt("0x58627e1a149bba21"), BigInt("0x2cd16e2abd791e33"), BigInt("0xd363eff5f0977996"),
	BigInt("0x0ce2a38c344a6eed"), BigInt("0x1a804aadb9cfa741"), BigInt("0x907f30421d78c5de"), BigInt("0x501f65edb3034d07"),
	BigInt("0x37624ae5a48fa6e9"), BigInt("0x957baf61700cff4e"), BigInt("0x3a6c27934e31188a"), BigInt("0xd49503536abca345"),
	BigInt("0x088e049589c432e0"), BigInt("0xf943aee7febf21b8"), BigInt("0x6c3b8e3e336139d3"), BigInt("0x364f6ffa464ee52e"),
	BigInt("0xd60f6dcedc314222"), BigInt("0x56963b0dca418fc0"), BigInt("0x16f50edf91e513af"), BigInt("0xef1955914b609f93"),
	BigInt("0x565601c0364e3228"), BigInt("0xecb53939887e8175"), BigInt("0xbac7a9a18531294b"), BigInt("0xb344c470397bba52"),
	BigInt("0x65d34954daf3cebd"), BigInt("0xb4b81b3fa97511e2"), BigInt("0xb422061193d6f6a7"), BigInt("0x071582401c38434d"),
	BigInt("0x7a13f18bbedc4ff5"), BigInt("0xbc4097b116c524d2"), BigInt("0x59b97885e2f2ea28"), BigInt("0x99170a5dc3115544"),
	BigInt("0x6f423357e7c6a9f9"), BigInt("0x325928ee6e6f8794"), BigInt("0xd0e4366228b03343"), BigInt("0x565c31f7de89ea27"),
	BigInt("0x30f5611484119414"), BigInt("0xd873db391292ed4f"), BigInt("0x7bd94e1d8e17debc"), BigInt("0xc7d9f16864a76e94"),
	BigInt("0x947ae053ee56e63c"), BigInt("0xc8c93882f9475f5f"), BigInt("0x3a9bf55ba91f81ca"), BigInt("0xd9a11fbb3d9808e4"),
	BigInt("0x0fd22063edc29fca"), BigInt("0xb3f256d8aca0b0b9"), BigInt("0xb03031a8b4516e84"), BigInt("0x35dd37d5871448af"),
	BigInt("0xe9f6082b05542e4e"), BigInt("0xebfafa33d7254b59"), BigInt("0x9255abb50d532280"), BigInt("0xb9ab4ce57f2d34f3"),
	BigInt("0x693501d628297551"), BigInt("0xc62c58f97dd949bf"), BigInt("0xcd454f8f19c5126a"), BigInt("0xbbe83f4ecc2bdecb"),
	BigInt("0xdc842b7e2819e230"), BigInt("0xba89142e007503b8"), BigInt("0xa3bc941d0a5061cb"), BigInt("0xe9f6760e32cd8021"),
	BigInt("0x09c7e552bc76492f"), BigInt("0x852f54934da55cc9"), BigInt("0x8107fccf064fcf56"), BigInt("0x098954d51fff6580"),
	BigInt("0x23b70edb1955c4bf"), BigInt("0xc330de426430f69d"), BigInt("0x4715ed43e8a45c0a"), BigInt("0xa8d7e4dab780a08d"),
	BigInt("0x0572b974f03ce0bb"), BigInt("0xb57d2e985e1419c7"), BigInt("0xe8d9ecbe2cf3d73f"), BigInt("0x2fe4b17170e59750"),
	BigInt("0x11317ba87905e790"), BigInt("0x7fbf21ec8a1f45ec"), BigInt("0x1725cabfcb045b00"), BigInt("0x964e915cd5e2b207"),
	BigInt("0x3e2b8bcbf016d66d"), BigInt("0xbe7444e39328a0ac"), BigInt("0xf85b2b4fbcde44b7"), BigInt("0x49353fea39ba63b1"),
	BigInt("0x1dd01aafcd53486a"), BigInt("0x1fca8a92fd719f85"), BigInt("0xfc7c95d827357afa"), BigInt("0x18a6a990c8b35ebd"),
	BigInt("0xcccb7005c6b9c28d"), BigInt("0x3bdbb92c43b17f26"), BigInt("0xaa70b5b4f89695a2"), BigInt("0xe94c39a54a98307f"),
	BigInt("0xb7a0b174cff6f36e"), BigInt("0xd4dba84729af48ad"), BigInt("0x2e18bc1ad9704a68"), BigInt("0x2de0966daf2f8b1c"),
	BigInt("0xb9c11d5b1e43a07e"), BigInt("0x64972d68dee33360"), BigInt("0x94628d38d0c20584"), BigInt("0xdbc0d2b6ab90a559"),
	BigInt("0xd2733c4335c6a72f"), BigInt("0x7e75d99d94a70f4d"), BigInt("0x6ced1983376fa72b"), BigInt("0x97fcaacbf030bc24"),
	BigInt("0x7b77497b32503b12"), BigInt("0x8547eddfb81ccb94"), BigInt("0x79999cdff70902cb"), BigInt("0xcffe1939438e9b24"),
	BigInt("0x829626e3892d95d7"), BigInt("0x92fae24291f2b3f1"), BigInt("0x63e22c147b9c3403"), BigInt("0xc678b6d860284a1c"),
	BigInt("0x5873888850659ae7"), BigInt("0x0981dcd296a8736d"), BigInt("0x9f65789a6509a440"), BigInt("0x9ff38fed72e9052f"),
	BigInt("0xe479ee5b9930578c"), BigInt("0xe7f28ecd2d49eecd"), BigInt("0x56c074a581ea17fe"), BigInt("0x5544f7d774b14aef"),
	BigInt("0x7b3f0195fc6f290f"), BigInt("0x12153635b2c0cf57"), BigInt("0x7f5126dbba5e0ca7"), BigInt("0x7a76956c3eafb413"),
	BigInt("0x3d5774a11d31ab39"), BigInt("0x8a1b083821f40cb4"), BigInt("0x7b4a38e32537df62"), BigInt("0x950113646d1d6e03"),
	BigInt("0x4da8979a0041e8a9"), BigInt("0x3bc36e078f7515d7"), BigInt("0x5d0a12f27ad310d1"), BigInt("0x7f9d1a2e1ebe1327"),
	BigInt("0xda3a361b1c5157b1"), BigInt("0xdcdd7d20903d0c25"), BigInt("0x36833336d068f707"), BigInt("0xce68341f79893389"),
	BigInt("0xab9090168dd05f34"), BigInt("0x43954b3252dc25e5"), BigInt("0xb438c2b67f98e5e9"), BigInt("0x10dcd78e3851a492"),
	BigInt("0xdbc27ab5447822bf"), BigInt("0x9b3cdb65f82ca382"), BigInt("0xb67b7896167b4c84"), BigInt("0xbfced1b0048eac50"),
	BigInt("0xa9119b60369ffebd"), BigInt("0x1fff7ac80904bf45"), BigInt("0xac12fb171817eee7"), BigInt("0xaf08da9177dda93d"),
	BigInt("0x1b0cab936e65c744"), BigInt("0xb559eb1d04e5e932"), BigInt("0xc37b45b3f8d6f2ba"), BigInt("0xc3a9dc228caac9e9"),
	BigInt("0xf3b8b6675a6507ff"), BigInt("0x9fc477de4ed681da"), BigInt("0x67378d8eccef96cb"), BigInt("0x6dd856d94d259236"),
	BigInt("0xa319ce15b0b4db31"), BigInt("0x073973751f12dd5e"), BigInt("0x8a8e849eb32781a5"), BigInt("0xe1925c71285279f5"),
	BigInt("0x74c04bf1790c0efe"), BigInt("0x4dda48153c94938a"), BigInt("0x9d266d6a1cc0542c"), BigInt("0x7440fb816508c4fe"),
	BigInt("0x13328503df48229f"), BigInt("0xd6bf7baee43cac40"), BigInt("0x4838d65f6ef6748f"), BigInt("0x1e152328f3318dea"),
	BigInt("0x8f8419a348f296bf"), BigInt("0x72c8834a5957b511"), BigInt("0xd7a023a73260b45c"), BigInt("0x94ebc8abcfb56dae"),
	BigInt("0x9fc10d0f989993e0"), BigInt("0xde68a2355b93cae6"), BigInt("0xa44cfe79ae538bbe"), BigInt("0x9d1d84fcce371425"),
	BigInt("0x51d2b1ab2ddfb636"), BigInt("0x2fd7e4b9e72cd38c"), BigInt("0x65ca5b96b7552210"), BigInt("0xdd69a0d8ab3b546d"),
	BigInt("0x604d51b25fbf70e2"), BigInt("0x73aa8a564fb7ac9e"), BigInt("0x1a8c1e992b941148"), BigInt("0xaac40a2703d9bea0"),
	BigInt("0x764dbeae7fa4f3a6"), BigInt("0x1e99b96e70a9be8b"), BigInt("0x2c5e9deb57ef4743"), BigInt("0x3a938fee32d29981"),
	BigInt("0x26e6db8ffdf5adfe"), BigInt("0x469356c504ec9f9d"), BigInt("0xc8763c5b08d1908c"), BigInt("0x3f6c6af859d80055"),
	BigInt("0x7f7cc39420a3a545"), BigInt("0x9bfb227ebdf4c5ce"), BigInt("0x89039d79d6fc5c5c"), BigInt("0x8fe88b57305e2ab6"),
	BigInt("0xa09e8c8c35ab96de"), BigInt("0xfa7e393983325753"), BigInt("0xd6b6d0ecc617c699"), BigInt("0xdfea21ea9e7557e3"),
	BigInt("0xb67c1fa481680af8"), BigInt("0xca1e3785a9e724e5"), BigInt("0x1cfc8bed0d681639"), BigInt("0xd18d8549d140caea"),
	BigInt("0x4ed0fe7e9dc91335"), BigInt("0xe4dbf0634473f5d2"), BigInt("0x1761f93a44d5aefe"), BigInt("0x53898e4c3910da55"),
	BigInt("0x734de8181f6ec39a"), BigInt("0x2680b122baa28d97"), BigInt("0x298af231c85bafab"), BigInt("0x7983eed3740847d5"),
	BigInt("0x66c1a2a1a60cd889"), BigInt("0x9e17e49642a3e4c1"), BigInt("0xedb454e7badc0805"), BigInt("0x50b704cab602c329"),
	BigInt("0x4cc317fb9cddd023"), BigInt("0x66b4835d9eafea22"), BigInt("0x219b97e26ffc81bd"), BigInt("0x261e4e4c0a333a9d"),
	BigInt("0x1fe2cca76517db90"), BigInt("0xd7504dfa8816edbb"), BigInt("0xb9571fa04dc089c8"), BigInt("0x1ddc0325259b27de"),
	BigInt("0xcf3f4688801eb9aa"), BigInt("0xf4f5d05c10cab243"), BigInt("0x38b6525c21a42b0e"), BigInt("0x36f60e2ba4fa6800"),
	BigInt("0xeb3593803173e0ce"), BigInt("0x9c4cd6257c5a3603"), BigInt("0xaf0c317d32adaa8a"), BigInt("0x258e5a80c7204c4b"),
	BigInt("0x8b889d624d44885d"), BigInt("0xf4d14597e660f855"), BigInt("0xd4347f66ec8941c3"), BigInt("0xe699ed85b0dfb40d"),
	BigInt("0x2472f6207c2d0484"), BigInt("0xc2a1e7b5b459aeb5"), BigInt("0xab4f6451cc1d45ec"), BigInt("0x63767572ae3d6174"),
	BigInt("0xa59e0bd101731a28"), BigInt("0x116d0016cb948f09"), BigInt("0x2cf9c8ca052f6e9f"), BigInt("0x0b090a7560a968e3"),
	BigInt("0xabeeddb2dde06ff1"), BigInt("0x58efc10b06a2068d"), BigInt("0xc6e57a78fbd986e0"), BigInt("0x2eab8ca63ce802d7"),
	BigInt("0x14a195640116f336"), BigInt("0x7c0828dd624ec390"), BigInt("0xd74bbe77e6116ac7"), BigInt("0x804456af10f5fb53"),
	BigInt("0xebe9ea2adf4321c7"), BigInt("0x03219a39ee587a30"), BigInt("0x49787fef17af9924"), BigInt("0xa1e9300cd8520548"),
	BigInt("0x5b45e522e4b1b4ef"), BigInt("0xb49c3b3995091a36"), BigInt("0xd4490ad526f14431"), BigInt("0x12a8f216af9418c2"),
	BigInt("0x001f837cc7350524"), BigInt("0x1877b51e57a764d5"), BigInt("0xa2853b80f17f58ee"), BigInt("0x993e1de72d36d310"),
	BigInt("0xb3598080ce64a656"), BigInt("0x252f59cf0d9f04bb"), BigInt("0xd23c8e176d113600"), BigInt("0x1bda0492e7e4586e"),
	BigInt("0x21e0bd5026c619bf"), BigInt("0x3b097adaf088f94e"), BigInt("0x8d14dedb30be846e"), BigInt("0xf95cffa23af5f6f4"),
	BigInt("0x3871700761b3f743"), BigInt("0xca672b91e9e4fa16"), BigInt("0x64c8e531bff53b55"), BigInt("0x241260ed4ad1e87d"),
	BigInt("0x106c09b972d2e822"), BigInt("0x7fba195410e5ca30"), BigInt("0x7884d9bc6cb569d8"), BigInt("0x0647dfedcd894a29"),
	BigInt("0x63573ff03e224774"), BigInt("0x4fc8e9560f91b123"), BigInt("0x1db956e450275779"), BigInt("0xb8d91274b9e9d4fb"),
	BigInt("0xa2ebee47e2fbfce1"), BigInt("0xd9f1f30ccd97fb09"), BigInt("0xefed53d75fd64e6b"), BigInt("0x2e6d02c36017f67f"),
	BigInt("0xa9aa4d20db084e9b"), BigInt("0xb64be8d8b25396c1"), BigInt("0x70cb6af7c2d5bcf0"), BigInt("0x98f076a4f7a2322e"),
	BigInt("0xbf84470805e69b5f"), BigInt("0x94c3251f06f90cf3"), BigInt("0x3e003e616a6591e9"), BigInt("0xb925a6cd0421aff3"),
	BigInt("0x61bdd1307c66e300"), BigInt("0xbf8d5108e27e0d48"), BigInt("0x240ab57a8b888b20"), BigInt("0xfc87614baf287e07"),
	BigInt("0xef02cdd06ffdb432"), BigInt("0xa1082c0466df6c0a"), BigInt("0x8215e577001332c8"), BigInt("0xd39bb9c3a48db6cf"),
	BigInt("0x2738259634305c14"), BigInt("0x61cf4f94c97df93d"), BigInt("0x1b6baca2ae4e125b"), BigInt("0x758f450c88572e0b"),
	BigInt("0x959f587d507a8359"), BigInt("0xb063e962e045f54d"), BigInt("0x60e8ed72c0dff5d1"), BigInt("0x7b64978555326f9f"),
	BigInt("0xfd080d236da814ba"), BigInt("0x8c90fd9b083f4558"), BigInt("0x106f72fe81e2c590"), BigInt("0x7976033a39f7d952"),
	BigInt("0xa4ec0132764ca04b"), BigInt("0x733ea705fae4fa77"), BigInt("0xb4d8f77bc3e56167"), BigInt("0x9e21f4f903b33fd9"),
	BigInt("0x9d765e419fb69f6d"), BigInt("0xd30c088ba61ea5ef"), BigInt("0x5d94337fbfaf7f5b"), BigInt("0x1a4e4822eb4d7a59"),
	BigInt("0x6ffe73e81b637fb3"), BigInt("0xddf957bc36d8b9ca"), BigInt("0x64d0e29eea8838b3"), BigInt("0x08dd9bdfd96b9f63"),
	BigInt("0x087e79e5a57d1d13"), BigInt("0xe328e230e3e2b3fb"), BigInt("0x1c2559e30f0946be"), BigInt("0x720bf5f26f4d2eaa"),
	BigInt("0xb0774d261cc609db"), BigInt("0x443f64ec5a371195"), BigInt("0x4112cf68649a260e"), BigInt("0xd813f2fab7f5c5ca"),
	BigInt("0x660d3257380841ee"), BigInt("0x59ac2c7873f910a3"), BigInt("0xe846963877671a17"), BigInt("0x93b633abfa3469f8"),
	BigInt("0xc0c0f5a60ef4cdcf"), BigInt("0xcaf21ecd4377b28c"), BigInt("0x57277707199b8175"), BigInt("0x506c11b9d90e8b1d"),
	BigInt("0xd83cc2687a19255f"), BigInt("0x4a29c6465a314cd1"), BigInt("0xed2df21216235097"), BigInt("0xb5635c95ff7296e2"),
	BigInt("0x22af003ab672e811"), BigInt("0x52e762596bf68235"), BigInt("0x9aeba33ac6ecc6b0"), BigInt("0x944f6de09134dfb6"),
	BigInt("0x6c47bec883a7de39"), BigInt("0x6ad047c430a12104"), BigInt("0xa5b1cfdba0ab4067"), BigInt("0x7c45d833aff07862"),
	BigInt("0x5092ef950a16da0b"), BigInt("0x9338e69c052b8e7b"), BigInt("0x455a4b4cfe30e3f5"), BigInt("0x6b02e63195ad0cf8"),
	BigInt("0x6b17b224bad6bf27"), BigInt("0xd1e0ccd25bb9c169"), BigInt("0xde0c89a556b9ae70"), BigInt("0x50065e535a213cf6"),
	BigInt("0x9c1169fa2777b874"), BigInt("0x78edefd694af1eed"), BigInt("0x6dc93d9526a50e68"), BigInt("0xee97f453f06791ed"),
	BigInt("0x32ab0edb696703d3"), BigInt("0x3a6853c7e70757a7"), BigInt("0x31865ced6120f37d"), BigInt("0x67fef95d92607890"),
	BigInt("0x1f2b1d1f15f6dc9c"), BigInt("0xb69e38a8965c6b65"), BigInt("0xaa9119ff184cccf4"), BigInt("0xf43c732873f24c13"),
	BigInt("0xfb4a3d794a9a80d2"), BigInt("0x3550c2321fd6109c"), BigInt("0x371f77e76bb8417e"), BigInt("0x6bfa9aae5ec05779"),
	BigInt("0xcd04f3ff001a4778"), BigInt("0xe3273522064480ca"), BigInt("0x9f91508bffcfc14a"), BigInt("0x049a7f41061a9e60"),
	BigInt("0xfcb6be43a9f2fe9b"), BigInt("0x08de8a1c7797da9b"), BigInt("0x8f9887e6078735a1"), BigInt("0xb5b4071dbfc73a66"),
	BigInt("0x230e343dfba08d33"), BigInt("0x43ed7f5a0fae657d"), BigInt("0x3a88a0fbbcb05c63"), BigInt("0x21874b8b4d2dbc4f"),
	BigInt("0x1bdea12e35f6a8c9"), BigInt("0x53c065c6c8e63528"), BigInt("0xe34a1d250e7a8d6b"), BigInt("0xd6b04d3b7651dd7e"),
	BigInt("0x5e90277e7cb39e2d"), BigInt("0x2c046f22062dc67d"), BigInt("0xb10bb459132d0a26"), BigInt("0x3fa9ddfb67e2f199"),
	BigInt("0x0e09b88e1914f7af"), BigInt("0x10e8b35af3eeab37"), BigInt("0x9eedeca8e272b933"), BigInt("0xd4c718bc4ae8ae5f"),
	BigInt("0x81536d601170fc20"), BigInt("0x91b534f885818a06"), BigInt("0xec8177f83f900978"), BigInt("0x190e714fada5156e"),
	BigInt("0xb592bf39b0364963"), BigInt("0x89c350c893ae7dc1"), BigInt("0xac042e70f8b383f2"), BigInt("0xb49b52e587a1ee60"),
	BigInt("0xfb152fe3ff26da89"), BigInt("0x3e666e6f69ae2c15"), BigInt("0x3b544ebe544c19f9"), BigInt("0xe805a1e290cf2456"),
	BigInt("0x24b33c9d7ed25117"), BigInt("0xe74733427b72f0c1"), BigInt("0x0a804d18b7097475"), BigInt("0x57e3306d881edb4f"),
	BigInt("0x4ae7d6a36eb5dbcb"), BigInt("0x2d8d5432157064c8"), BigInt("0xd1e649de1e7f268b"), BigInt("0x8a328a1cedfe552c"),
	BigInt("0x07a3aec79624c7da"), BigInt("0x84547ddc3e203c94"), BigInt("0x990a98fd5071d263"), BigInt("0x1a4ff12616eefc89"),
	BigInt("0xf6f7fd1431714200"), BigInt("0x30c05b1ba332f41c"), BigInt("0x8d2636b81555a786"), BigInt("0x46c9feb55d120902"),
	BigInt("0xccec0a73b49c9921"), BigInt("0x4e9d2827355fc492"), BigInt("0x19ebb029435dcb0f"), BigInt("0x4659d2b743848a2c"),
	BigInt("0x963ef2c96b33be31"), BigInt("0x74f85198b05a2e7d"), BigInt("0x5a0f544dd2b1fb18"), BigInt("0x03727073c2e134b1"),
	BigInt("0xc7f6aa2de59aea61"), BigInt("0x352787baa0d7c22f"), BigInt("0x9853eab63b5e0b35"), BigInt("0xabbdcdd7ed5c0860"),
	BigInt("0xcf05daf5ac8d77b0"), BigInt("0x49cad48cebf4a71e"), BigInt("0x7a4c10ec2158c4a6"), BigInt("0xd9e92aa246bf719e"),
	BigInt("0x13ae978d09fe5557"), BigInt("0x730499af921549ff"), BigInt("0x4e4b705b92903ba4"), BigInt("0xff577222c14f0a3a"),
	BigInt("0x55b6344cf97aafae"), BigInt("0xb862225b055b6960"), BigInt("0xcac09afbddd2cdb4"), BigInt("0xdaf8e9829fe96b5f"),
	BigInt("0xb5fdfc5d3132c498"), BigInt("0x310cb380db6f7503"), BigInt("0xe87fbb46217a360e"), BigInt("0x2102ae466ebb1148"),
	BigInt("0xf8549e1a3aa5e00d"), BigInt("0x07a69afdcc42261a"), BigInt("0xc4c118bfe78feaae"), BigInt("0xf9f4892ed96bd438"),
	BigInt("0x1af3dbe25d8f45da"), BigInt("0xf5b4b0b0d2deeeb4"), BigInt("0x962aceefa82e1c84"), BigInt("0x046e3ecaaf453ce9"),
	BigInt("0xf05d129681949a4c"), BigInt("0x964781ce734b3c84"), BigInt("0x9c2ed44081ce5fbd"), BigInt("0x522e23f3925e319e"),
	BigInt("0x177e00f9fc32f791"), BigInt("0x2bc60a63a6f3b3f2"), BigInt("0x222bbfae61725606"), BigInt("0x486289ddcc3d6780"),
	BigInt("0x7dc7785b8efdfc80"), BigInt("0x8af38731c02ba980"), BigInt("0x1fab64ea29a2ddf7"), BigInt("0xe4d9429322cd065a"),
	BigInt("0x9da058c67844f20c"), BigInt("0x24c0e332b70019b0"), BigInt("0x233003b5a6cfe6ad"), BigInt("0xd586bd01c5c217f6"),
	BigInt("0x5e5637885f29bc2b"), BigInt("0x7eba726d8c94094b"), BigInt("0x0a56a5f0bfe39272"), BigInt("0xd79476a84ee20d06"),
	BigInt("0x9e4c1269baa4bf37"), BigInt("0x17efee45b0dee640"), BigInt("0x1d95b0a5fcf90bc6"), BigInt("0x93cbe0b699c2585d"),
	BigInt("0x65fa4f227a2b6d79"), BigInt("0xd5f9e858292504d5"), BigInt("0xc2b5a03f71471a6f"), BigInt("0x59300222b4561e00"),
	BigInt("0xce2f8642ca0712dc"), BigInt("0x7ca9723fbb2e8988"), BigInt("0x2785338347f2ba08"), BigInt("0xc61bb3a141e50e8c"),
	BigInt("0x150f361dab9dec26"), BigInt("0x9f6a419d382595f4"), BigInt("0x64a53dc924fe7ac9"), BigInt("0x142de49fff7a7c3d"),
	BigInt("0x0c335248857fa9e7"), BigInt("0x0a9c32d5eae45305"), BigInt("0xe6c42178c4bbb92e"), BigInt("0x71f1ce2490d20b07"),
	BigInt("0xf1bcc3d275afe51a"), BigInt("0xe728e8c83c334074"), BigInt("0x96fbf83a12884624"), BigInt("0x81a1549fd6573da5"),
	BigInt("0x5fa7867caf35e149"), BigInt("0x56986e2ef3ed091b"), BigInt("0x917f1dd5f8886c61"), BigInt("0xd20d8c88c8ffe65f"),
]);

const PolyglotCastleXorVals = BigUint64Array.from([
	BigInt("0x31d71dce64b2c310"), BigInt("0xf165b587df898190"), BigInt("0xa57e6339dd2cf3a0"), BigInt("0x1ef6e6dbb1961ec9"),
	BigInt("0x0000000000000000"), BigInt("0x0000000000000000"), BigInt("0x0000000000000000"), BigInt("0x0000000000000000"),		// FIXME: what are the
	BigInt("0x0000000000000000"), BigInt("0x0000000000000000"), BigInt("0x0000000000000000"), BigInt("0x0000000000000000"),		// right values here??
]);

const PolyglotEnPassantXorVals = BigUint64Array.from([
	BigInt("0x70cc73d90bc26e24"), BigInt("0xe21a6b35df0c3ad7"), BigInt("0x003a93d8b2806962"), BigInt("0x1c99ded33cb890a1"),
	BigInt("0xcf3145de0add4289"), BigInt("0xd0e4427a5514fb72"), BigInt("0x77c621cc9fb3a483"), BigInt("0x67a34dac4356550b"),
]);

const PolyglotActiveXorVal = BigInt("0xf8d626aaaf278509");

// ------------------------------------------------------------------------------------------------------------------------

const PolyglotPieceKinds = "pPnNbBrRqQkK";								// The index is what matters, e.g. N is 3.
const PolyglotPromotions = ["", "n", "b", "r", "q", "", "", ""];		// Values in indices 5-7 just in case.

// ------------------------------------------------------------------------------------------------------------------------

function BigIntToHex(big) {
	let s = big.toString(16);
	while (s.length < 16) s = "0" + s;
	return s;
}

function KeyFromBoard(board) {

	if (!board) return "";

	let keynum = BigInt(0);

	// Note to anyone reading this trying to make their own Polyglot routines:
	// My board (0,0) is a8, not a1. Otherwise, you'd use y and not (7 - y) in the index calc.

	for (let x = 0; x < 8; x++) {
		for (let y = 0; y < 8; y++) {
			if (!board.state[x][y]) {
				continue;
			}
			let piecekind = PolyglotPieceKinds.indexOf(board.state[x][y]);
			if (piecekind === -1) {
				continue;
			}
			let index = (64 * piecekind) + (8 * (7 - y)) + x;					// I mean here.
			keynum ^= PolyglotPieceXorVals[index];
		}
	}

	if (board.castling.includes("H")) keynum ^= PolyglotCastleXorVals[0];
	if (board.castling.includes("A")) keynum ^= PolyglotCastleXorVals[1];
	if (board.castling.includes("h")) keynum ^= PolyglotCastleXorVals[2];
	if (board.castling.includes("a")) keynum ^= PolyglotCastleXorVals[3];

	if (board.castling.includes("B")) keynum ^= PolyglotCastleXorVals[4];
	if (board.castling.includes("C")) keynum ^= PolyglotCastleXorVals[5];
	if (board.castling.includes("D")) keynum ^= PolyglotCastleXorVals[6];
	if (board.castling.includes("E")) keynum ^= PolyglotCastleXorVals[7];
	if (board.castling.includes("F")) keynum ^= PolyglotCastleXorVals[8];
	if (board.castling.includes("G")) keynum ^= PolyglotCastleXorVals[9];

	if (board.castling.includes("b")) keynum ^= PolyglotCastleXorVals[10];
	if (board.castling.includes("c")) keynum ^= PolyglotCastleXorVals[11];
	if (board.castling.includes("d")) keynum ^= PolyglotCastleXorVals[12];
	if (board.castling.includes("e")) keynum ^= PolyglotCastleXorVals[13];
	if (board.castling.includes("f")) keynum ^= PolyglotCastleXorVals[14];
	if (board.castling.includes("g")) keynum ^= PolyglotCastleXorVals[15];

	// Happily, the format's idea of when an en passant square should be included is identical to mine...
	// "If the opponent has performed a double pawn push and there is now a pawn next to it belonging to the player to move."

	if (board.enpassant) {
		keynum ^= PolyglotEnPassantXorVals[board.enpassant.x];
	}

	if (board.active === "w") {
		keynum ^= PolyglotActiveXorVal;
	}

	let key = new Uint8Array(8);
	key[0] = Number(keynum >> BigInt(56) & BigInt(0xff));
	key[1] = Number(keynum >> BigInt(48) & BigInt(0xff));
	key[2] = Number(keynum >> BigInt(40) & BigInt(0xff));
	key[3] = Number(keynum >> BigInt(32) & BigInt(0xff));
	key[4] = Number(keynum >> BigInt(24) & BigInt(0xff));
	key[5] = Number(keynum >> BigInt(16) & BigInt(0xff));
	key[6] = Number(keynum >> BigInt( 8) & BigInt(0xff));
	key[7] = Number(keynum               & BigInt(0xff));

	return key;
}

function ExtractInfo(arr) {

	// Given 16 bytes, extract the needed stuff. Resist the temptation to use
	// much << in this, JavaScript bit fiddling is a pain.

	if (arr.length !== 16 || !(arr instanceof Uint8Array)) {
		throw "ExtractInfo bad arg";
	}

	// Bytes 0-7 represent the key as a big-endian number.

	let hi = (arr[0] * 16777216) + (arr[1] * 65536) + (arr[2] * 256) + arr[3];
	let lo = (arr[4] * 16777216) + (arr[5] * 65536) + (arr[6] * 256) + arr[7];
	let keynum = (BigInt(hi) << BigInt(32)) + BigInt(lo);

	let key = new Uint8Array(8);
	key[0] = Number(keynum >> BigInt(56) & BigInt(0xff));
	key[1] = Number(keynum >> BigInt(48) & BigInt(0xff));
	key[2] = Number(keynum >> BigInt(40) & BigInt(0xff));
	key[3] = Number(keynum >> BigInt(32) & BigInt(0xff));
	key[4] = Number(keynum >> BigInt(24) & BigInt(0xff));
	key[5] = Number(keynum >> BigInt(16) & BigInt(0xff));
	key[6] = Number(keynum >> BigInt( 8) & BigInt(0xff));
	key[7] = Number(keynum               & BigInt(0xff));

	// Bytes 8-9 represent the move as a big-endian bitfield, uh...

	let move = ExtractMove((arr[8] * 256) + arr[9]);

	// Bytes 10-11 represent the quality as a big-endian number.

	let weight = (arr[10] * 256) + arr[11];

	// Bytes 12-15 are ignored by us.

	return {key, move, weight};
}

function ExtractMove(num) {

	// Bits  0-2   :  To file			(0-2 means the rightmost bits)
	// Bits  3-5   :  To row
	// Bits  6-8   :  From file
	// Bits  9-11  :  From row
	// Bits 12-14  :  Promotion

	if (num < 0 || num > 65535) {
		throw "ExtractMove bad arg";
	}

	let to_file    =  (num >>  0) & 0x07;
	let to_row     =  (num >>  3) & 0x07;
	let from_file  =  (num >>  6) & 0x07;
	let from_row   =  (num >>  9) & 0x07;
	let promval    =  (num >> 12) & 0x07;

	let source = Point(from_file, 7 - from_row);
	let dest = Point(to_file, 7 - to_row);

	let promch = PolyglotPromotions[promval];

	return source.s + dest.s + promch;
}

function PolyglotProbe(board, book) {

	if (!book || Array.isArray(book) === false || book.length === 0) {
		return [];
	}

	let key = KeyFromBoard(board);

	if (!key) {
		return [];
	}

	let mid;
	let hit;
	let cur;
	let lowerbound = 0;
	let upperbound = book.length - 1;

	while (true) {

		if (lowerbound > upperbound) {

			console.log("PolyglotProbe(): lowerbound > upperbound");
			break;

		} else if (lowerbound === upperbound) {

			cur = book[lowerbound];
			if (CompareKeys(cur.key, key) === 0) {
				hit = lowerbound;
			}
			break;

		} else {

			mid = Math.floor((upperbound + lowerbound) / 2);		// If upper and lower are neighbours, mid is the left one.
			cur = book[mid];

			if (CompareKeys(cur.key, key) === 0) {
				hit = mid;
				break;
			}

			if (CompareKeys(cur.key, key) < 0) {
				lowerbound = mid + 1;		// +1 is used here so the neighbours case does change lower.
			} else {
				upperbound = mid;			// In the neighbours case, upper becomes equal to lower. Can't do -1 or it would go to the left of lower.
			}
			continue;
		}
	}

	if (hit === undefined) {
		return [];
	}

	let left = hit;
	let right = hit;

	while (left > 0) {
		if (book[left - 1].key === key) {
			left--;
		} else {
			break;
		}
	}

	while (right < book.length - 1) {
		if (book[right + 1].key === key) {
			right++;
		} else {
			break;
		}
	}

	return book.slice(left, right + 1);
}

function CompareKeys(a, b) {						// Return -1 / 0 / 1

	if (a[0] < b[0]) return -1;
	if (a[0] > b[0]) return 1;
	if (a[1] < b[1]) return -1;
	if (a[1] > b[1]) return 1;
	if (a[2] < b[2]) return -1;
	if (a[2] > b[2]) return 1;
	if (a[3] < b[3]) return -1;
	if (a[3] > b[3]) return 1;
	if (a[4] < b[4]) return -1;
	if (a[4] > b[4]) return 1;
	if (a[5] < b[5]) return -1;
	if (a[5] > b[5]) return 1;
	if (a[6] < b[6]) return -1;
	if (a[6] > b[6]) return 1;
	if (a[7] < b[7]) return -1;
	if (a[7] > b[7]) return 1;

	return 0;
}
