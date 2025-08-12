from google.cloud import language_v1

class NaturalLanguageProcessor:
    def __init__(self):
        self.client = language_v1.LanguageServiceClient()

    def analyze_text(self, text_content: str):
        """
        Google Cloud Natural Language APIを呼び出して、エンティティとセンチメントを分析する。
        """
        document = language_v1.Document(content=text_content, type_=language_v1.Document.Type.PLAIN_TEXT)

        # エンティティ分析
        entities_response = self.client.analyze_entities(request={'document': document})
        entities = entities_response.entities

        # センチメント分析 いったん後回し
        #sentiment_response = self.client.analyze_sentiment(request={'document': document})
        #document_sentiment = sentiment_response.document_sentiment

        return {
            "entities": entities,
        #   "sentiment": document_sentiment
        }
